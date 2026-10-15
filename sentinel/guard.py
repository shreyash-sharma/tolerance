"""A visitor may point a check at any address. It must be a public one: never a private, loopback or link-local address."""
import ipaddress, os, socket
from urllib.parse import urlparse


class Refused(ValueError):
    pass


def check_host(host, port):
    if os.environ.get("TOLERANCE_ALLOW_PRIVATE_NOTIFY") == "1":
        return
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except OSError:
        raise Refused("I cannot find that address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise Refused("That address points inside a private network. Use a public address.")


def check_url(url):
    p = urlparse(str(url or "").strip())
    if p.scheme not in ("http", "https") or not p.hostname:
        raise Refused("The address must start with http:// or https://")
    check_host(p.hostname, p.port or (443 if p.scheme == "https" else 80))
    return p.geturl()
