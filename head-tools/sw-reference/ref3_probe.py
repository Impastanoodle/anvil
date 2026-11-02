"""Look only: revision, open titles, load, default templates. Creates nothing."""
from ref3_core import *  # noqa: F401,F403

ses = Ses()
print("rev", val(ses.sw, "RevisionNumber"), "titles", ses.titles(), "load", sw_load(), "docs used", doc_count())
for p in (7, 8, 9, 10, 11):
    print("pref", p, ses.sw.GetUserPreferenceStringValue(p))
