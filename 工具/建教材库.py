#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""建「教材」语料库。

为什么要有这个东西：应用是纯前端，取正文只能靠浏览器 fetch，于是同时受两个
限制卡死——国内能直连的站（古登堡、OpenStax、中国日报）不放行跨域，放行跨域
的站（维基百科系）在国内连不上。两边没有交集。

解法是把语料预先抓好、分好级、打包成静态 JSON 放进本仓库，前端从 jsDelivr 取：
    https://cdn.jsdelivr.net/gh/faqiang007/dian-du-english@main/教材/索引.json
jsDelivr 国内直连可达且回 access-control-allow-origin: *，两个限制一起绕开。

这个脚本在**开发机上跑**（需要能访问 gutenberg.org），产出提交进仓库。
用户端不跑它，也不需要能访问古登堡。

    python3 工具/建教材库.py

产出：
    教材/索引.json        全部条目的元数据，前端进页面拉一次
    教材/篇目/<id>.json   每篇正文，点开才拉
"""

import json
import os
import re
import sys
import subprocess
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "教材")
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".缓存")

# 每篇的长度区间。**超长的整篇丢弃，绝不切碎。**
# 切碎会得到「STAVE IV (9/9)」这种东西，读者点进去前不着村后不着店——
# 一个篇目必须是一个完整的单元：一则寓言、一篇童话、一个短篇、一整章。
MIN_WORDS = 110
MAX_WORDS = 2400

# 古登堡书目。全部版权已过期、属公有领域。
# split: "toc" 用目录标题切（短篇集），"chapter" 按 CHAPTER 行切（长篇）
BOOKS = [
    # 末位是**难度先验区间**。纯可读性公式在几百词的片段上不可信：对话密集的段
    # 句子短，会把《圣诞颂歌》判成 A2；Simple Wikipedia 的 Electricity 反被判成
    # C2。来源类型是比公式稳得多的信号，所以公式只负责在区间内选一档。
    (21,   "Aesop's Fables",            "Aesop",                  "寓言",     "toc",     ("A2", "B1")),
    (2591, "Grimms' Fairy Tales",       "Jacob & Wilhelm Grimm",  "童话",     "toc",     ("A2", "B1")),
    (1597, "Andersen's Fairy Tales",    "Hans Christian Andersen","童话",     "toc",     ("B1", "B2")),
    (236,  "The Jungle Book",           "Rudyard Kipling",        "小说",     "toc",     ("B1", "B2")),
    (11,   "Alice's Adventures in Wonderland", "Lewis Carroll",   "小说",     "chapter", ("B1", "B2")),
    (74,   "The Adventures of Tom Sawyer", "Mark Twain",          "小说",     "chapter", ("B1", "B2")),
    (2776, "The Four Million",          "O. Henry",               "短篇小说", "toc",     ("B2", "C1")),
    (1661, "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "短篇小说", "toc",  ("B2", "C1")),
    (46,   "A Christmas Carol",         "Charles Dickens",        "小说",     "chapter", ("B2", "C1")),
    (35,   "The Time Machine",          "H. G. Wells",            "小说",     "chapter", ("B2", "C1")),
    (43,   "Dr. Jekyll and Mr. Hyde",   "Robert Louis Stevenson", "小说",     "chapter", ("C1", "C2")),
    (1342, "Pride and Prejudice",       "Jane Austen",            "小说",     "chapter", ("C1", "C2")),
    (84,   "Frankenstein",              "Mary Shelley",           "小说",     "chapter", ("C1", "C2")),
    (345,  "Dracula",                   "Bram Stoker",            "小说",     "chapter", ("C1", "C2")),
]

# Simple English Wikipedia 词条，CC BY-SA 4.0，可自由转载（数据里带署名和许可）
WIKI = [
    "Cat", "Dog", "Elephant", "Panda", "Dolphin", "Bee", "Penguin",
    "Rice", "Bread", "Tea", "Coffee", "Chocolate", "Pizza",
    "Weather", "Rain", "Snow", "Volcano", "Earthquake", "Rainbow",
    "Sun", "Moon", "Planet", "Star", "Gravity", "Electricity", "Magnet",
    "Bicycle", "Train", "Airplane", "Ship", "Car",
    "Football", "Basketball", "Swimming", "Olympic Games", "Chess",
    "Music", "Piano", "Guitar", "Painting", "Photography", "Film",
    "Internet", "Computer", "Robot", "Telephone", "Money", "Bank",
    "School", "Library", "Hospital", "Doctor", "Teacher",
    "Sleep", "Dream", "Heart", "Brain", "Bone", "Vitamin", "Exercise",
    "Great Wall of China", "Beijing", "Shanghai", "Chinese language",
    "Tea ceremony", "Silk Road", "Giant panda", "Dragon",
    "Horse", "Rabbit", "Tiger", "Whale", "Butterfly", "Ant", "Owl", "Shark",
    "Apple", "Banana", "Egg", "Milk", "Sugar", "Salt", "Noodle", "Soup",
    "Wind", "Cloud", "Thunder", "Desert", "Forest", "Ocean", "River", "Mountain",
    "Fire", "Water", "Air", "Metal", "Glass", "Paper", "Plastic",
    "Clock", "Camera", "Battery", "Light bulb", "Radio", "Television",
    "Running", "Cycling", "Yoga", "Dance", "Table tennis", "Badminton",
    "Bread", "Cheese", "Honey", "Garden", "Farm", "Village", "City",
    "Family", "Friend", "Birthday", "Holiday", "Festival", "Market",
    "Language", "Alphabet", "Number", "Color", "Shape", "Time",
    "Mars", "Earth", "Rainforest", "Antarctica", "Dinosaur", "Fossil",
]


def log(m):
    print(m, flush=True)


def fetch(url, name, want_json=False):
    """抓一次就落到 .缓存/，反复调试不用重复下载，也不给对方服务器添麻烦。

    want_json：连着快速请求维基会被限流，它回的是一页 HTML 而不是 JSON。
    不校验的话这页 HTML 会被当成正常结果缓存下来，之后每次跑都读到它，
    看起来像是「这个词条永远取不到」。所以校验通过才落盘，不通过就退避重试。
    """
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        t = open(p, encoding="utf-8", errors="replace").read()
        if not want_json:
            return t
        try:
            json.loads(t)
            return t
        except Exception:
            os.remove(p)   # 缓存里是坏的，删掉重抓
    # 用 curl 不用 urllib：urllib 在这台机器上找不到系统根证书，
    # 对 https 一律报 CERTIFICATE_VERIFY_FAILED；curl 用系统证书，也自动走系统代理
    last = ""
    for attempt in range(4):
        r = subprocess.run(["curl", "-sSL", "-m", "90", "-A", "007-english-corpus-builder", url],
                           capture_output=True)
        t = r.stdout.decode("utf-8", "replace")
        if r.returncode == 0 and t.strip():
            if not want_json:
                open(p, "w", encoding="utf-8").write(t)
                return t
            try:
                json.loads(t)
                open(p, "w", encoding="utf-8").write(t)
                return t
            except Exception as e:
                last = "非 JSON（多半被限流）：" + t.strip()[:80]
        else:
            last = r.stderr.decode("utf-8", "replace")[:120] or "空响应"
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(last)


# ---------- 正文提取 ----------

def strip_pg(t):
    """去掉古登堡的头尾声明，只留作品本身。"""
    s = re.search(r"\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", t)
    e = re.search(r"\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK", t)
    return t[s.end():e.start()] if s and e else t


def norm(s):
    """标题归一化，用来把目录条目和正文里的标题行对上。
    两处的大小写、标点、罗马数字编号常常不一致。"""
    s = re.sub(r"[’‘]", "'", s)
    s = re.sub(r"^\s*[IVXLC]+\s*[.．、]\s*", "", s.strip())
    s = re.sub(r"^\s*(CHAPTER|ADVENTURE|STORY)\s+[IVXLC0-9]+\s*[.．、:]?\s*", "", s, flags=re.I)
    s = re.sub(r"[^A-Za-z0-9]+", " ", s)
    return s.strip().lower()


def looks_title(s):
    """判断一行像不像篇目标题，而不是正文里的一句话。

    不加这个判断，目录解析会一路读进正文，把「Poor Hans was sadly frightened.」
    这种句子当成篇目标题收进来，正文里再一匹配就真的切在那儿了——实测踩过。
    """
    s = s.strip()
    if len(s) < 3 or len(s) > 70:
        return False
    # 句号/问号/感叹号后面还有内容 = 这是句子不是标题
    if re.search(r"[.!?][\"”')]?\s+\S", s):
        return False
    if s.endswith((",", ";", ":", "”", "\"", "’", "-", "—")):
        return False
    if "“" in s or "\"" in s:
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'’]*", s)
    if not words:
        return False
    # 标题是标题式大小写：除了虚词，每个词首字母大写；正文句子做不到
    small = {"a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with",
             "at", "by", "from", "is", "was", "his", "her", "its", "who", "that"}
    cap = sum(1 for w in words if w[0].isupper() or w.lower() in small)
    return cap / len(words) >= 0.85


def toc_titles(t):
    """从 CONTENTS 段落里取出篇目标题。"""
    m = re.search(r"^\s*CONTENTS:?\s*$", t, flags=re.M | re.I)
    if not m:
        return []
    tail = t[m.end():]
    out, blanks, miss = [], 0, 0
    for line in tail.split("\n"):
        if not line.strip():
            blanks += 1
            if blanks >= 6 and out:
                break
            continue
        blanks = 0
        s = line.strip()
        if not looks_title(s):
            # 目录结束、正文开始的信号。连着几行都不像标题就收手，
            # 别一路读进正文去。
            miss += 1
            if out and miss >= 3:
                break
            continue
        miss = 0
        out.append(s)
        if len(out) > 400:
            break
    return out


def split_by_titles(t, titles):
    """按标题在正文里的位置切段。
    目录里的标题在正文里会再出现一次（作为小标题），找那一次。"""
    lines = t.split("\n")
    want = {}
    for ti in titles:
        n = norm(ti)
        if len(n) >= 4:
            want.setdefault(n, ti)
    def standalone(i):
        """标题必须自成一行、前面留空。
        不加这条，正文里凑巧和某个标题字面相同的一行会被当成篇目开头——
        实测出现过 "the men who are thy brothers--if thou art" 变成篇目标题。"""
        if i > 0 and lines[i - 1].strip():
            return False
        return True

    marks = []
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or len(s) > 90:
            continue
        if not standalone(i) or not looks_title(s):
            continue
        n = norm(s)
        if n in want:
            marks.append((i, want[n]))
    # 同一个标题目录里、正文里各出现一次，只保留后面那次（正文里的）
    seen, keep = {}, []
    for i, ti in marks:
        seen.setdefault(ti, []).append(i)
    for ti, idxs in seen.items():
        keep.append((idxs[-1], ti))
    keep.sort()
    out = []
    for k, (i, ti) in enumerate(keep):
        j = keep[k + 1][0] if k + 1 < len(keep) else len(lines)
        out.append((ti, "\n".join(lines[i + 1:j])))
    return out


def split_by_chapter(t):
    """按 CHAPTER / 罗马数字行切。长篇小说用这个。"""
    lines = t.split("\n")
    marks = []
    for i, line in enumerate(lines):
        s = line.strip()
        ok = re.match(r"^(CHAPTER|Chapter|STAVE|Stave)\s+[IVXLC0-9]+", s) and len(s) < 90
        # 《时间机器》《化身博士》的章标题就是孤零零一行罗马数字，没有 CHAPTER 字样
        if not ok and re.fullmatch(r"[IVXLC]{1,6}\.?", s):
            ok = (i > 0 and not lines[i - 1].strip())
        if ok:
            marks.append((i, s))
    out = []
    for k, (i, ti) in enumerate(marks):
        j = marks[k + 1][0] if k + 1 < len(marks) else len(lines)
        out.append((ti, "\n".join(lines[i + 1:j])))
    return out


def paragraphs(raw):
    """把硬换行的纯文本还原成段落。古登堡的文本每行 70 字符硬折，
    直接按 \\n 切会把一句话切碎。空行才是真正的段落分隔。"""
    raw = re.sub(r"\r", "", raw)
    raw = re.sub(r"[ \t]+", " ", raw)
    blocks = re.split(r"\n\s*\n", raw)
    out = []
    for b in blocks:
        p = " ".join(x.strip() for x in b.split("\n")).strip()
        p = re.sub(r"\s+", " ", p)
        # 插图标记、页码、分隔线这些不是正文
        if not p or re.fullmatch(r"[\[\]\*\-—_=\d\s\.]+", p):
            continue
        if p.startswith("[Illustration") or p.startswith("[Footnote"):
            continue
        out.append(p)
    return out


# ---------- 难度评分 ----------

def syllables(w):
    w = w.lower().strip("'")
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return 0
    if w.endswith("e") and not w.endswith(("le", "ee", "ye")):
        w = w[:-1]
    n = len(re.findall(r"[aeiouy]+", w))
    return max(1, n)


def grade(text):
    """算两个可读性指标，取它们对 CEFR 的共识。

    单看 Flesch 不够：经典文学用词浅但句子长，Flesch 会把福尔摩斯判成 B1。
    Gunning Fog 把句长和长词都算进去，对这类文本区分度更好，所以以它为主。
    """
    sents = [s for s in re.split(r"[.!?]+[\s\"']", text) if s.strip()]
    words = re.findall(r"[A-Za-z']+", text)
    if len(words) < 40 or not sents:
        return None
    asl = len(words) / len(sents)                       # 平均句长
    syl = sum(syllables(w) for w in words)
    hard = sum(1 for w in words if syllables(w) >= 3)
    fre = 206.835 - 1.015 * asl - 84.6 * (syl / len(words))
    fog = 0.4 * (asl + 100.0 * hard / len(words))
    return {"asl": round(asl, 1), "fre": round(fre, 1), "fog": round(fog, 1)}


ORDER = ["A2", "B1", "B2", "C1", "C2"]


def to_cefr(g, prior):
    """在来源给定的区间里，用可读性挑一档。

    公式单独用不可信（见 BOOKS 上方的注释），但在「伊索寓言是 A2~B1」这个
    前提下，用它区分「这则偏简单」和「这则偏难」是站得住的。
    """
    lo, hi = ORDER.index(prior[0]), ORDER.index(prior[1])
    if lo == hi:
        return ORDER[lo]
    # Fog 8 以下算这个区间里偏易的，12 以上算偏难的，中间线性摊开
    fog = g["fog"]
    t = (fog - 8.0) / 4.0
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return ORDER[lo + int(round(t * (hi - lo)))]


def wc(text):
    return len(re.findall(r"[A-Za-z']+", text))


# ---------- 组装 ----------

def nice_title(raw, book):
    """把「CHAPTER XII.」「XIII.」这种裸标题补成「书名 · 第 XII 章」。
    列表里一屏十几个「CHAPTER V.」，不补书名根本分不清是哪本。"""
    t = re.sub(r"[\]\[]+", "", raw).strip().rstrip(".").strip()
    t = re.sub(r"\s{2,}", " ", t)
    # CHAPTER 关键词不能写成可选：写成可选的话「CLEVER HANS」会被拆成
    # 罗马数字 CL +「EVER HANS」。要么带关键词，要么整行就是个编号。
    m = re.fullmatch(r"(?:CHAPTER|Chapter|STAVE|Stave)\s+([IVXLC]{1,7}|\d{1,3})\s*[.:]?\s*(.*)", t)
    if not m:
        m = re.fullmatch(r"([IVXLC]{1,7}|\d{1,3})\s*[.:]?\s*()", t)
    if m:
        num, rest = m.group(1), (m.group(2) or "").strip(" .:—-")
        head = "%s · 第 %s 章" % (book, num)
        return head + ("  " + rest if rest else "")
    return t


def slug(s, n=48):
    s = re.sub(r"[’‘]", "", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s[:n] or "x"


def chunk(paras, cap):
    """长章节切成几段读，按段落边界切，不切断句子。"""
    out, cur, n = [], [], 0
    for p in paras:
        w = wc(p)
        if cur and n + w > cap:
            out.append(cur)
            cur, n = [], 0
        cur.append(p)
        n += w
    if cur:
        out.append(cur)
    return out


def make_one(paras, prior):
    """一个完整单元 → 一篇。长度不合格就丢掉，**不切碎**。
    返回 (正文, 难度, 指标) 或 None。"""
    text = "\n\n".join(paras)
    n = wc(text)
    if n < MIN_WORDS or n > MAX_WORDS:
        return None
    g = grade(text)
    if not g:
        return None
    return (text, to_cefr(g, prior), g)


def build_gutenberg(items):
    for gid, book, author, kind, how, prior in BOOKS:
        log("  取 pg%d %s" % (gid, book))
        raw = strip_pg(fetch("https://www.gutenberg.org/cache/epub/%d/pg%d.txt" % (gid, gid),
                             "pg%d.txt" % gid))
        parts = split_by_titles(raw, toc_titles(raw)) if how == "toc" else split_by_chapter(raw)
        if not parts:
            log("    ! 切不出篇目，跳过")
            continue
        got = 0
        for title, seg in parts:
            paras = paragraphs(seg)
            if not paras:
                continue
            one = make_one(paras, prior)
            if not one:
                continue
            text, lv, g = one
            if True:
                t = nice_title(title, book)
                items.append({
                    "id": "pg%d-%s" % (gid, slug(title)),
                    "title": t, "book": book, "author": author, "kind": kind,
                    "lv": lv, "words": wc(text), "fog": g["fog"], "fre": g["fre"],
                    "src": "Project Gutenberg", "srcUrl": "https://www.gutenberg.org/ebooks/%d" % gid,
                    "lic": "公有领域（版权已过期）",
                    "text": text,
                })
                got += 1
        log("    得 %d 篇" % got)


def build_wiki(items):
    for title in WIKI:
        try:
            u = ("https://simple.wikipedia.org/w/api.php?action=query&format=json&origin=*"
                 "&prop=extracts&explaintext=1&redirects=1&titles=" + urllib.parse.quote(title))
            d = json.loads(fetch(u, "wiki-%s.json" % slug(title), want_json=True))
            page = list(d["query"]["pages"].values())[0]
            txt = page.get("extract") or ""
        except Exception as e:
            log("  ! %s 取不到：%r" % (title, e))
            continue
        # 去掉「Related pages / References」之后的部分，那些不是正文
        txt = re.split(r"\n==+ ?(Related pages|References|Other websites|Sources)", txt)[0]
        paras = [p.strip() for p in txt.split("\n") if p.strip() and not p.strip().startswith("==")]
        if not paras:
            continue
        real = page.get("title", title)
        # 只取开头几段。百科词条动辄两三千词，整篇留会超长；而导言部分本来就是
        # 最浅、最自成一体的一段，对学习者反而比通篇更合适。
        lead, n = [], 0
        for para in paras:
            lead.append(para)
            n += wc(para)
            if n >= 600:
                break
        one = make_one(lead, ("A2", "B1"))
        if one:
            text, lv, g = one
            items.append({
                "id": "sw-%s" % slug(real),
                "title": real,
                "book": "Simple English Wikipedia", "author": "维基百科编者", "kind": "科普",
                "lv": lv, "words": wc(text), "fog": g["fog"], "fre": g["fre"],
                "src": "Simple English Wikipedia",
                "srcUrl": "https://simple.wikipedia.org/wiki/" + urllib.parse.quote(real.replace(" ", "_")),
                "lic": "CC BY-SA 4.0",
                "text": text,
            })
        log("  维基 %s ✓" % title)


def balance(items, per_lv):
    """每个难度只留 per_lv 篇，并且同一本书不要占太多，免得某个难度全是同一本。"""
    order = ["A2", "B1", "B2", "C1", "C2"]
    out = []
    for lv in order:
        pool = [x for x in items if x["lv"] == lv]
        # 按书轮流取
        by = {}
        for x in pool:
            by.setdefault(x["book"], []).append(x)
        for v in by.values():
            v.sort(key=lambda x: x["words"])
        picked, i = [], 0
        while len(picked) < per_lv:
            added = False
            for b in sorted(by):
                if i < len(by[b]):
                    picked.append(by[b][i])
                    added = True
                    if len(picked) >= per_lv:
                        break
            if not added:
                break
            i += 1
        out.extend(picked)
    return out


def main():
    items = []
    log("== 古登堡 ==")
    build_gutenberg(items)
    log("== Simple English Wikipedia ==")
    build_wiki(items)

    log("\n候选共 %d 篇，各难度：" % len(items))
    for lv in ["A2", "B1", "B2", "C1", "C2"]:
        log("  %s  %d" % (lv, sum(1 for x in items if x["lv"] == lv)))

    per = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    final = balance(items, per)

    os.makedirs(os.path.join(OUT, "篇目"), exist_ok=True)
    # 清掉上一次的产物，免得删掉的篇目还留在仓库里
    for f in os.listdir(os.path.join(OUT, "篇目")):
        if f.endswith(".json"):
            os.remove(os.path.join(OUT, "篇目", f))

    index = []
    for x in final:
        one = {k: x[k] for k in ("id", "title", "text", "src", "srcUrl", "lic", "author", "book")}
        with open(os.path.join(OUT, "篇目", x["id"] + ".json"), "w", encoding="utf-8") as f:
            json.dump(one, f, ensure_ascii=False, separators=(",", ":"))
        index.append({k: x[k] for k in ("id", "title", "book", "author", "kind", "lv", "words", "src", "srcUrl", "lic")})

    with open(os.path.join(OUT, "索引.json"), "w", encoding="utf-8") as f:
        json.dump({"v": 1, "n": len(index), "items": index}, f, ensure_ascii=False, separators=(",", ":"))

    log("\n== 产出 %d 篇 ==" % len(index))
    for lv in ["A2", "B1", "B2", "C1", "C2"]:
        sel = [x for x in final if x["lv"] == lv]
        log("  %s  %2d 篇  平均 %d 词" % (lv, len(sel), sum(x["words"] for x in sel) / max(1, len(sel))))
    log("索引 %.1f KB" % (os.path.getsize(os.path.join(OUT, "索引.json")) / 1024))


if __name__ == "__main__":
    main()
