"""The plant record: its name, where the person is in the first-time flow, the connectors they allowed, and the guide's conversation.
Stages: name -> files -> guide -> layout -> tour -> done. (The brain animation between name and files runs in the browser.)"""
import os, time

from workspace import store

STAGES = ["name", "files", "guide", "layout", "tour", "done"]


def fresh():
    return {"name": "", "stage": "name", "use_sample": False, "connectors": [], "chat": [], "phase": None, "goal": None, "goal_skipped": False, "notes": [], "layout": None, "tour": None, "created": time.time()}


def get():
    """The plant record. A new install has none: create one at the first stage, so the first visit is the first-time flow."""
    d = store.load()
    if not d.get("plant"):
        store.update(lambda x: x.__setitem__("plant", fresh()))
        d = store.load()
    return d["plant"]


def update(fn):
    def f(d):
        p = d.get("plant") or fresh()
        fn(p)
        d["plant"] = p
    store.update(f)
    return get()


def set_name(name):
    name = " ".join(str(name).split())[:60]
    if len(name) < 2:
        raise ValueError("give the plant a name of at least two characters")
    return update(lambda p: p.update(name=name, stage="files" if p["stage"] == "name" else p["stage"]))


def set_stage(stage):
    if stage not in STAGES:
        raise ValueError("unknown stage")
    return update(lambda p: p.__setitem__("stage", stage))


def use_sample(on=True):
    return update(lambda p: p.__setitem__("use_sample", bool(on)))


def reset():
    """Back to the first-time flow. Removes uploaded documents, extracted claims, the plan and the chat. Warden's two lines stay."""
    from documents import engine as DE
    if os.path.isdir(DE.uploads_dir()):
        for fn in os.listdir(DE.uploads_dir()):
            try:
                os.remove(os.path.join(DE.uploads_dir(), fn))
            except OSError:
                pass

    def f(d):
        d["plant"] = fresh()
        d["docs"] = {}
        d.pop("jig_plan", None)
        d["jig_actions"] = []
        (d.get("safety") or {}).pop("approvals", None)
    store.update(f)
    return get()
