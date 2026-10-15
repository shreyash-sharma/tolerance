"""The data systems the plant's own documents name: databases, ERP, MES, brokers, MCP servers. For each one it keeps the exact sentence that names it and any address or table the
document gives, so the owner is asked for THAT system, not for a generic list. Plain pattern matching, no model: the quote can always be checked against the page."""
import re

# id -> (title, system tag for the icon, how to connect, honest status, what to ask for, patterns)
#   connect: url (a database address), rest (an API address), mcp (an MCP server address), upload (an export file)
CATALOG = [
    ("mongo", "MongoDB", "mongo", "upload", "plug", "Upload the mongoexport file (.jsonl). A live link to a MongoDB server goes through a bridge.", r"mongo\s?db|mongo\b|mongoexport"),
    ("postgres", "PostgreSQL", "postgres", "url", "plug", "The read-only address, like postgresql://reader@host:5432/plantdb. No password in this box.", r"postgres(?:ql)?\b"),
    ("mysql", "MySQL / MariaDB", "sql", "url", "bridge", "A read-only address. This build needs its driver added; it is written down for setup.", r"mysql|mariadb"),
    ("mssql", "SQL Server", "sql", "url", "bridge", "A read-only address. This build needs its driver added; it is written down for setup.", r"sql server|mssql|t-sql"),
    ("oracle", "Oracle database", "sql", "url", "bridge", "A read-only address. This build needs its driver added; it is written down for setup.", r"oracle (?:db|database|11|12|19|21)\b|oracledb"),
    ("sap", "SAP", "erp", "rest", "plug", "The OData or REST address of the service, or upload an export of the orders.", r"\bSAP\b|s/4\s?hana"),
    ("erp", "ERP system", "erp", "rest", "plug", "The REST address of the ERP, or upload an export of its orders (CSV or SQLite).", r"\bERP\b|odoo|netsuite|dynamics 365|infor\b"),
    ("mes", "MES", "mes", "rest", "plug", "The REST address of the MES, or upload its station log (CSV or SQLite).", r"\bMES\b|opcenter|camstar|manufacturing execution"),
    ("historian", "Historian / SCADA", "other", "upload", "bridge", "Upload an export of the tags you want (CSV). A live link goes through a bridge.", r"historian|aveva|osisoft|\bPI System\b|ignition\b|scada|wonderware"),
    ("opcua", "OPC UA", "opcua", "note", "live", "The controller address, like opc.tcp://host:4840. It is read only.", r"opc[\s-]?ua"),
    ("mqtt", "MQTT / IoT broker", "mqtt", "upload", "bridge", "Upload a log of the topics (CSV or JSON lines). A live link goes through a bridge.", r"mqtt|sparkplug|iot (?:hub|broker|gateway)"),
    ("kafka", "Kafka", "other", "upload", "bridge", "Upload a sample of the stream (JSON lines). A live link goes through a bridge.", r"kafka|redpanda"),
    ("plc", "PLC (Modbus, S7, Rockwell)", "other", "upload", "bridge", "Upload a register log (CSV). A live link goes through a protocol adapter.", r"modbus|\bS7-\d+|siemens s7|allen[- ]bradley|rockwell|profinet|\bPLC\b"),
    ("cmms", "Maintenance system", "other", "upload", "bridge", "Upload an export of the work orders (CSV).", r"maximo|\bCMMS\b|\bfiix\b|upkeep"),
    ("warehouse", "Data warehouse", "other", "upload", "bridge", "Upload an export of the history you want (CSV).", r"bigquery|snowflake|databricks|redshift"),
    ("files", "Shared files", "files", "upload", "plug", "Upload the file (CSV or SQLite).", r"\bS3\b|\bGCS\b|azure blob|sharepoint|network share"),
    ("mcp", "MCP server", "api", "mcp", "bridge", "The address of this MCP server. It is written down for setup. Tools it brings will pass the Warden gate.", r"\bMCP\b|model context protocol"),
]
ENGINES = {"mongo", "postgres", "mysql", "mssql", "oracle"}
CASE = {"sap", "erp", "mes", "mcp", "plc"}
ADDR = re.compile(r"(?:https?|postgres(?:ql)?|mongodb(?:\+srv)?|mysql|opc\.tcp|mqtts?|tcp)://[^\s)\"'`>,]+|\b[a-z0-9][a-z0-9.-]*\.(?:local|internal|corp|lan|plant)(?::\d{2,5})?\b|\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?\b", re.I)
NAMED = re.compile(r"\b(?:collections?|tables?|schemas?|databases?|topics?|queues?)\s+(?:(?:named|called)\s+)?[`'\"]?([A-Za-z_][\w.-]{2,40})[`'\"]?", re.I)
STOP = {"and", "the", "for", "that", "with", "from", "this", "are", "is", "of", "in", "to", "on", "as", "by", "or", "a", "an", "it", "its", "has", "was", "which"}


def _sentences(text):
    for line in text.splitlines():
        line = line.strip().lstrip("-*#>| ").strip()
        if not line:
            continue
        for s in re.split(r"(?<=[.!?])\s+", line):
            s = s.strip()
            if s:
                yield s


LABEL = re.compile(r"\b([A-Za-z][\w-]{1,24})\s+(?:MCP|database|db|server|broker|historian)\b", re.I)
GENERIC = {"the", "our", "a", "an", "this", "that", "each", "every", "any", "new", "old", "main", "and", "or", "with", "on", "in", "to", "of", "for", "mcp", "sql", "data", "plant", "model", "context", "protocol", "tool", "remote"}


def _label(sentence):
    for m in LABEL.findall(sentence):
        if m.lower() not in GENERIC:
            return m.lower()
    return ""


def _ident(sid, sentence, addr, names):
    """What tells two systems of the same kind apart in this sentence: an address, else a database or collection name, else a label such as 'MES' in 'the MES MCP server'."""
    if addr:
        return addr[0].lower().rstrip("/")
    if names:
        return names[0].lower()
    if sid == "mcp":
        for m in LABEL.findall(sentence):
            if m.lower() not in GENERIC:
                return m.lower()
    return ""


def find(docs):
    """docs: [{'name', 'text'}]. One entry per system INSTANCE the documents name: two Postgres databases are two entries, three MCP servers are three.
    Each keeps up to two quotes (the sentences that name it), its address and any table or collection names. A kind named only in general terms gets one entry."""
    inst = {}
    for d in docs:
        for s in _sentences(d.get("text") or ""):
            addr = [m.rstrip(".;") for m in ADDR.findall(s)]
            names = [m for m in NAMED.findall(s) if m.lower() not in STOP]
            hit = [c for c in CATALOG if re.search(c[6], s, 0 if c[0] in CASE else re.I)]
            kinds = {c[0] for c in hit}
            if "mcp" in kinds:   # an MCP server's sentence is about that server, not about the system behind it
                hit = [c for c in hit if c[0] == "mcp"]
            elif kinds & ENGINES:   # an address next to a database engine is the database's address
                hit = [c for c in hit if c[0] in ENGINES]
            for sid, title, tag, mode, status, ask, pat in hit:
                key = (sid, _ident(sid, s, addr, names))
                e = inst.setdefault(key, {"id": sid + (":" + key[1] if key[1] else ""), "type": sid, "title": title, "system": tag, "mode": mode, "status": status, "ask": ask, "quotes": [], "addresses": [], "names": [], "label": key[1], "tag": ""})
                if len(e["quotes"]) < 2 and not any(q["quote"] == s[:220] for q in e["quotes"]):
                    e["quotes"].append({"quote": s[:220], "doc": d["name"]})
                if sid == "mcp" and not e["tag"]:
                    e["tag"] = _label(s)
                for m in addr:
                    if m not in e["addresses"] and len(e["addresses"]) < 3:
                        e["addresses"].append(m)
                for m in names:
                    if m not in e["names"] and len(e["names"]) < 5:
                        e["names"].append(m)
    # a kind named in general terms is covered when the documents also name a specific one of that kind
    for (sid, ident) in list(inst):
        if ident == "" and any(k[0] == sid and k[1] for k in inst):
            del inst[(sid, ident)]
    order = [c[0] for c in CATALOG]
    res = sorted(inst.values(), key=lambda e: (order.index(e["type"]), e["id"]))
    # two kinds named next to the same address are one system (an ERP gateway the MES reads, for example): keep the first, with the other's sentence
    seen, keep = {}, []
    for e in res:
        a = e["addresses"][0] if e["addresses"] else ""
        if a and a in seen and seen[a]["type"] != e["type"]:
            for q in e["quotes"]:
                if len(seen[a]["quotes"]) < 3 and q not in seen[a]["quotes"]:
                    seen[a]["quotes"].append(q)
            continue
        if a:
            seen[a] = e
        keep.append(e)
    res = keep
    for e in res:
        e["hint"] = e["addresses"][0] if e["addresses"] else ""
        tag = e["tag"] or (e["names"][0] if e["names"] else "")
        e["name"] = e["title"] + (" · " + tag if tag else "") + (" · " + e["hint"] if e["hint"] else "")
    return res
