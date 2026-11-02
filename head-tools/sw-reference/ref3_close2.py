"""Item 6, second try, in Part41 (made by ref3_close.py and left open when its command stopped on a message box). A sketch on the
block's top face, the chain selected, the same command. A watcher thread reads and presses OK on a SOLIDWORKS message box this
command raises (class #32770, title SOLIDWORKS, one OK button), so the run never waits on it. Closes Part41 at the end.
"""
import json
import subprocess
import threading
import time

import win32con
import win32gui
import win32process

from ref3_core import *  # noqa: F401,F403
from ref3_close import contours

MINE = "Part41"
seen = []
stop = False


def sw_pid():
    q = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-Process SLDWORKS).Id"], capture_output=True, text=True, timeout=30)
    return int(q.stdout.split()[0])


def read_text(h):
    ps = ("Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; $el=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]%d); "
          "$all=$el.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition); foreach($e in $all){$e.Current.Name}") % h
    try:
        return subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, timeout=25).stdout.split("\n")
    except Exception as e:  # noqa: BLE001
        return ["read failed " + str(e)[:80]]


def watch(pid):
    while not stop:
        found = []

        def cb(h, _):
            try:
                if win32gui.IsWindowVisible(h) and win32gui.GetClassName(h) == "#32770" and win32process.GetWindowThreadProcessId(h)[1] == pid:
                    found.append(h)
            except Exception:  # noqa: BLE001
                pass
            return True
        win32gui.EnumWindows(cb, None)
        for h in found:
            if win32gui.GetWindowText(h) != "SOLIDWORKS":
                continue
            btn = []

            def kids(k, _):
                if win32gui.GetClassName(k) == "Button":
                    btn.append((k, win32gui.GetWindowText(k)))
                return True
            win32gui.EnumChildWindows(h, kids, None)
            seen.append({"t": time.time(), "text": [x.strip() for x in read_text(h) if x.strip()], "buttons": [b[1] for b in btn]})
            ok = [b for b in btn if b[1] == "OK"]
            if len(btn) == 1 and ok:
                win32gui.PostMessage(ok[0][0], win32con.BM_CLICK, 0, 0)
            time.sleep(1)
        time.sleep(0.5)


def main():
    global stop
    ses = Session()
    t = ses.titles()
    print("open", t, flush=True)
    if t != [MINE]:
        print("STOP: expected only", MINE, flush=True)
        return
    ses.pre.discard(MINE)
    ses.mine.add(MINE)
    m = [d for d in items(val(ses.sw, "GetDocuments")) if val(d, "GetTitle") == MINE][0]
    th = threading.Thread(target=watch, args=(sw_pid(),), daemon=True)
    th.start()
    sm = m.SketchManager
    res = {"seen": seen}
    c = Ctx.__new__(Ctx)
    c.ses, c.sw, c.m, c.yshift, c.scale = ses, ses.sw, m, 0.0, 1.0
    try:
        if val(m, "GetActiveSketch2") is not None:
            m.ClearSelection2(True)
            sm.InsertSketch(True)
        for name, y0 in (("face_on", 0.0), ("face_off", -0.2)):
            m.ClearSelection2(True)
            fc = c.face_at([2, 1, 1.5])
            c.pick(fc, False, 0)
            sm.InsertSketch(True)
            sm.AddToDB = True
            lines = [sm.CreateLine(a[0] * IN, a[1] * IN, 0, b[0] * IN, b[1] * IN, 0) for a, b in (((1, y0), (1, -1.5)), ((1, -1.5), (3, -1.5)), ((3, -1.5), (3, y0)))]
            sm.AddToDB = False
            sk = val(m, "GetActiveSketch2")
            r = {"segs0": len(items(val(sk, "GetSketchSegments"))), "contours0": contours(sk)}
            m.ClearSelection2(True)
            for i, q in enumerate(lines):
                q.Select4(i > 0, nothing())
            n0 = len(seen)
            r["run"] = bool(m.Extension.RunCommand(1048, ""))
            time.sleep(3)
            r["dialogs"] = seen[n0:]
            r["messages"] = ses.new_messages()
            act = val(m, "GetActiveSketch2")
            r["editing"] = act is not None
            if act is not None:
                r["segs1"] = len(items(val(act, "GetSketchSegments")))
                r["contours1"] = contours(act)
            m.ClearSelection2(True)
            if val(m, "GetActiveSketch2") is not None:
                sm.InsertSketch(True)
            res[name] = r
            print(name, r, flush=True)
            dump("close2", res)
    finally:
        stop = True
        time.sleep(1)
        dump("close2", res)
        if val(m, "GetActiveSketch2") is not None:
            m.ClearSelection2(True)
            sm.InsertSketch(True)
        ses.sw.CloseDoc(MINE)
    print("open now", ses.titles(), "load", sw_load(), flush=True)


if __name__ == "__main__":
    main()
