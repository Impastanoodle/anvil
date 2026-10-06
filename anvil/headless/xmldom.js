// headless/xmldom.js — the little DOMParser that tests/kernel-tests.html needs under Node to check the SVG exports:
// a strict XML parser (elements, attributes, text, CDATA, comments, declarations, the five named entities and
// numeric character references) that gives a document with documentElement, getElementsByTagName, querySelector /
// querySelectorAll (tag, #id, .class, [attr], [attr="value"], descendant and child combinators, selector lists),
// and elements with getAttribute / hasAttribute, textContent, children / childNodes, parentNode and outerHTML (the
// element's own source text). Malformed input gives a document whose only child is a <parsererror> element, the way
// browsers report it. Not a general DOM: nothing here mutates.
'use strict';

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (e in ENTITIES) return ENTITIES[e];
    throw new Error('unknown entity &' + e + ';');
  });
}

class XmlNode {
  constructor(type) { this.nodeType = type; this.parentNode = null; this.childNodes = []; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((n) => n.textContent).join(''); }
  getAttribute(name) { return this.attributes && Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return !!this.attributes && Object.prototype.hasOwnProperty.call(this.attributes, name); }
  getElementsByTagName(tag) {
    const out = [];
    walk(this, (el) => { if (tag === '*' || el.tagName === tag) out.push(el); });
    return out;
  }
  querySelectorAll(selector) {
    const groups = parseSelector(selector), out = [];
    walk(this, (el) => { if (groups.some((g) => matchesChain(el, g, g.length - 1, this))) out.push(el); });
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get outerHTML() { return this.src ? this.src.slice(this.start, this.end) : ''; }
  get innerHTML() { return this.src ? this.src.slice(this.innerStart, this.innerEnd) : ''; }
}
function walk(root, fn) { root.childNodes.forEach((n) => { if (n.nodeType === 1) { fn(n); walk(n, fn); } }); }

// ------------------------------------------------------------------ selectors
// 'g[data-layer="TOP"] circle, path.hatch' -> [[compound, compound], [compound]]; a compound is
// { tag, id, classes, attrs: [{ name, value | null }], combinator: ' ' | '>' } (its combinator is the one before it)
function parseSelector(sel) {
  const groups = [];
  splitTop(sel, ',').forEach((part) => {
    const chain = [];
    const re = /\s*(>)?\s*([\w-]+|\*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]*\])*)/g;
    let pos = 0, m;
    while (pos < part.length) {
      re.lastIndex = pos;
      m = re.exec(part);
      if (!m || m.index !== pos || !m[0].trim()) {
        if (!part.slice(pos).trim()) break;
        throw new Error('unsupported selector "' + part + '"');
      }
      const c = { combinator: m[1] ? '>' : ' ', tag: m[2] && m[2] !== '*' ? m[2] : null, id: null, classes: [], attrs: [] };
      (m[3] || '').replace(/#([\w-]+)|\.([\w-]+)|\[([^\]=]+)(?:=("[^"]*"|'[^']*'|[^\]]*))?\]/g, (q, id, cls, an, av) => {
        if (id) c.id = id; else if (cls) c.classes.push(cls);
        else c.attrs.push({ name: an.trim(), value: av == null ? null : av.replace(/^["']|["']$/g, '') });
        return '';
      });
      chain.push(c);
      pos = m.index + m[0].length;
    }
    if (chain.length) groups.push(chain);
  });
  return groups;
}
function splitTop(s, ch) {
  const out = []; let depth = 0, cur = '';
  for (const c of s) {
    if (c === '[') depth++; else if (c === ']') depth--;
    if (c === ch && !depth) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.filter((x) => x.trim());
}
function matchesCompound(el, c) {
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  if (c.classes.length) { const cls = (el.getAttribute('class') || '').split(/\s+/); if (!c.classes.every((k) => cls.indexOf(k) >= 0)) return false; }
  return c.attrs.every((a) => a.value == null ? el.hasAttribute(a.name) : el.getAttribute(a.name) === a.value);
}
function matchesChain(el, chain, i, scope) {
  if (!matchesCompound(el, chain[i])) return false;
  if (i === 0) return true;
  const comb = chain[i].combinator;
  let p = el.parentNode;
  if (comb === '>') return !!p && p !== scope && p.nodeType === 1 && matchesChain(p, chain, i - 1, scope);
  for (; p && p !== scope && p.nodeType === 1; p = p.parentNode) if (matchesChain(p, chain, i - 1, scope)) return true;
  return false;
}

// ------------------------------------------------------------------ parser
function parse(src) {
  const doc = new XmlNode(9);
  doc.nodeName = '#document'; doc.src = src; doc.start = 0; doc.end = src.length; doc.innerStart = 0; doc.innerEnd = src.length;
  const stack = [doc];
  let pos = 0;
  const NAME = /[A-Za-z_:][\w:.-]*/y;
  function text(s) { if (!s) return; const t = new XmlNode(3); t.nodeName = '#text'; t.nodeValue = s; t.parentNode = stack[stack.length - 1]; stack[stack.length - 1].childNodes.push(t); }
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) { text(decode(src.slice(pos))); pos = src.length; break; }
    if (lt > pos) text(decode(src.slice(pos, lt)));
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt); if (e < 0) throw new Error('unterminated processing instruction'); pos = e + 2; continue; }
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); if (e < 0) throw new Error('unterminated comment'); pos = e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); if (e < 0) throw new Error('unterminated CDATA'); text(src.slice(lt + 9, e)); pos = e + 3; continue; }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt); if (e < 0) throw new Error('unterminated declaration'); pos = e + 1; continue; }
    if (src.startsWith('</', lt)) {
      const e = src.indexOf('>', lt);
      if (e < 0) throw new Error('unterminated end tag');
      const name = src.slice(lt + 2, e).trim(), top = stack[stack.length - 1];
      if (top === doc || top.tagName !== name) throw new Error('unexpected end tag </' + name + '>' + (top !== doc ? ', expected </' + top.tagName + '>' : ''));
      top.end = e + 1; top.innerEnd = lt;
      stack.pop();
      pos = e + 1;
      continue;
    }
    NAME.lastIndex = lt + 1;
    const nm = NAME.exec(src);
    if (!nm) throw new Error('stray < at ' + lt);
    const el = new XmlNode(1);
    el.tagName = el.nodeName = nm[0]; el.attributes = {}; el.src = src; el.start = lt;
    pos = NAME.lastIndex;
    for (;;) {
      while (pos < src.length && /\s/.test(src[pos])) pos++;
      if (src.startsWith('/>', pos)) { pos += 2; el.end = pos; el.innerStart = el.innerEnd = pos; break; }
      if (src[pos] === '>') { pos++; el.innerStart = pos; stack.push(el); break; }
      NAME.lastIndex = pos;
      const an = NAME.exec(src);
      if (!an) throw new Error('bad attribute in <' + el.tagName + '> at ' + pos);
      pos = NAME.lastIndex;
      while (pos < src.length && /\s/.test(src[pos])) pos++;
      if (src[pos] !== '=') throw new Error('attribute ' + an[0] + ' of <' + el.tagName + '> has no value');
      pos++;
      while (pos < src.length && /\s/.test(src[pos])) pos++;
      const q = src[pos];
      if (q !== '"' && q !== "'") throw new Error('attribute ' + an[0] + ' of <' + el.tagName + '> is not quoted');
      const e = src.indexOf(q, pos + 1);
      if (e < 0) throw new Error('unterminated attribute value');
      const raw = src.slice(pos + 1, e);
      if (raw.indexOf('<') >= 0) throw new Error('< in attribute value');
      el.attributes[an[0]] = decode(raw);
      pos = e + 1;
    }
    const parent = stack[stack.length - 1] === el ? stack[stack.length - 2] : stack[stack.length - 1];
    el.parentNode = parent; parent.childNodes.push(el);
  }
  if (stack.length > 1) throw new Error('unclosed <' + stack[stack.length - 1].tagName + '>');
  if (doc.children.length !== 1) throw new Error(doc.children.length ? 'more than one root element' : 'no root element');
  return doc;
}

class DOMParser {
  parseFromString(text) {
    try { return parse(String(text)); }
    catch (e) {
      const doc = new XmlNode(9), err = new XmlNode(1), t = new XmlNode(3);
      doc.nodeName = '#document'; err.tagName = err.nodeName = 'parsererror'; err.attributes = {}; err.parentNode = doc;
      t.nodeName = '#text'; t.nodeValue = String(e.message || e); t.parentNode = err;
      err.childNodes.push(t); doc.childNodes.push(err);
      return doc;
    }
  }
}
Object.defineProperty(XmlNode.prototype, 'documentElement', { get() { return this.nodeType === 9 ? this.children[0] || null : null; } });

module.exports = { DOMParser, parse };
