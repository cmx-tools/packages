const HTML_ELEMENTS = new Set(
  `a abbr address area article aside audio b base bdi bdo blockquote body br
   button canvas caption cite code col colgroup data datalist dd del details
   dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2
   h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend
   li link main map mark menu meta meter nav noscript object ol optgroup option
   output p picture pre progress q rp rt ruby s samp script search section
   select selectedcontent slot small source span strong style sub summary sup
   table tbody td template textarea tfoot th thead time title tr track u ul var
   video wbr`.split(/\s+/),
);

const BOOLEAN_ATTRIBUTE_ELEMENTS: Readonly<
  Record<string, readonly string[] | null>
> = {
  allowfullscreen: ["iframe"],
  async: ["script"],
  autofocus: null,
  autoplay: ["audio", "video"],
  checked: ["input"],
  controls: ["audio", "video"],
  default: ["track"],
  defer: ["script"],
  disabled: [
    "button",
    "fieldset",
    "input",
    "link",
    "optgroup",
    "option",
    "select",
    "textarea",
  ],
  disablepictureinpicture: ["video"],
  disableremoteplayback: ["audio", "video"],
  formnovalidate: ["button", "input"],
  hidden: null,
  inert: null,
  itemscope: null,
  loop: ["audio", "video"],
  multiple: ["input", "select"],
  muted: ["audio", "video"],
  nomodule: ["script"],
  novalidate: ["form"],
  open: ["details", "dialog"],
  playsinline: ["video"],
  readonly: ["input", "textarea"],
  required: ["input", "select", "textarea"],
  reversed: ["ol"],
  selected: ["option"],
};

const BOOLEAN_STRING_ATTRIBUTE_ELEMENTS: Readonly<
  Record<string, readonly string[]>
> = {
  ismap: ["img"],
  shadowrootclonable: ["template"],
  shadowrootdelegatesfocus: ["template"],
  shadowrootserializable: ["template"],
};

export function normalizeCmxBooleanAttribute(
  tag: string,
  name: string,
  value: unknown,
): unknown {
  if (typeof value === "boolean") {
    if (name === "writingsuggestions" && HTML_ELEMENTS.has(tag)) {
      return String(value);
    }
    if (
      Object.hasOwn(BOOLEAN_STRING_ATTRIBUTE_ELEMENTS, name) &&
      BOOLEAN_STRING_ATTRIBUTE_ELEMENTS[name]?.includes(tag)
    ) {
      return value ? "" : undefined;
    }
  }
  if (value !== "" || !Object.hasOwn(BOOLEAN_ATTRIBUTE_ELEMENTS, name)) {
    return value;
  }
  const elements = BOOLEAN_ATTRIBUTE_ELEMENTS[name];
  return (elements === null ? HTML_ELEMENTS.has(tag) : elements?.includes(tag))
    ? true
    : value;
}
