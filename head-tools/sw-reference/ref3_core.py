"""SolidWorks check of what was never measured (lane swcheck, 2026-11-02): shared core on top of ref2.py.

Safety, in code:
  * guard(ses) runs before EVERY new document: it lists GetDocuments, and if a title is open that this process did not
    create it stops at once (exit 6) without touching that document. It also stops at LIMIT_HANDLES.
  * A running count of documents goes to OUT\\docs.json; the lane's total stays under 60.
  * Raw results go to OUT only. Nothing is ever saved over an existing file; only documents made here are closed, by title.
"""
import json
import os
import sys
import time

from ref2 import *  # noqa: F401,F403

OUT = os.path.join(OUT2, "check-unmeasured")
DOCS = os.path.join(OUT, "docs.json")
MAX_DOCS = 58


def doc_count():
    if os.path.exists(DOCS):
        with open(DOCS) as fh:
            return json.load(fh)["count"]
    return 0


def doc_bump(what):
    n = doc_count() + 1
    with open(DOCS, "w") as fh:
        json.dump({"count": n, "last": what}, fh)
    return n


def guard(ses, what=""):
    """Before a new document: no foreign document open, handles under the limit, under the document budget."""
    now = ses.titles()
    foreign = [t for t in now if t not in ses.mine]
    if foreign:
        print("STOP: documents open that this script did not create: %s" % foreign, flush=True)
        sys.exit(6)
    load = sw_load()
    if load and load[1] >= LIMIT_HANDLES:
        print("STOP: SLDWORKS handles %d" % load[1], flush=True)
        sys.exit(GUARD_EXIT)
    if doc_count() >= MAX_DOCS:
        print("STOP: %d documents used" % doc_count(), flush=True)
        sys.exit(7)
    return load


class Ses(Session):
    """Session with the guard on every new document."""

    def new(self, sheet=False):
        guard(self, "part")
        m = Session.new(self, sheet)
        doc_bump("part " + val(m, "GetTitle"))
        return m

    def new_from_pref(self, pref):
        """A new drawing (swDefaultTemplateDrawing 9) or assembly (swDefaultTemplateAssembly 7?) from the default template."""
        guard(self, "doc")
        tpl = self.sw.GetUserPreferenceStringValue(pref)
        m = self.sw.NewDocument(tpl, 2, 0.4318, 0.2794) if pref == DRAWING_PREF else self.sw.NewDocument(tpl, 0, 0, 0)   # B size, as ref2_callout
        if m is None:
            raise RuntimeError("NewDocument failed: " + str(tpl))
        t = val(m, "GetTitle")
        if t in self.pre:
            raise RuntimeError("new document has the title of a document that was already open: " + t)
        self.mine.add(t)
        doc_bump("doc " + t)
        return m


ASSEMBLY_PREF = 9   # filled in by ref3_probe (swDefaultTemplateAssembly)
DRAWING_PREF = 10   # filled in by ref3_probe (swDefaultTemplateDrawing)


def save_copy(ses, m, name):
    """Save my own document under OUT; never over an existing file."""
    ext = {1: ".SLDPRT", 2: ".SLDASM", 3: ".SLDDRW"}[val(m, "GetType")]
    p = os.path.join(OUT, name + ext)
    if os.path.exists(p):
        p = os.path.join(OUT, "%s-%d%s" % (name, int(time.time()), ext))
    t0 = val(m, "GetTitle")
    err = m.SaveAs3(p, 0, 1)
    t1 = val(m, "GetTitle")
    if t1 != t0:
        ses.mine.discard(t0)
        ses.mine.add(t1)
    return p, err


def dump(name, obj):
    p = os.path.join(OUT, name + ".json")
    with open(p, "w") as fh:
        json.dump(r9(obj), fh, indent=1, default=str)
    print("wrote", p, flush=True)
