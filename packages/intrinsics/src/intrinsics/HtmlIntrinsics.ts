import type { IntrinsicAttributes } from "./IntrinsicAttributes.js";

type NumericValue = number | `${number}`;
type BooleanAttribute = boolean | "";

type BooleanValue = boolean | "true" | "false";
type CrossOrigin = "" | "anonymous" | "use-credentials";
type ReferrerPolicy =
  | ""
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";
type InputType =
  | "button"
  | "checkbox"
  | "color"
  | "date"
  | "datetime-local"
  | "email"
  | "file"
  | "hidden"
  | "image"
  | "month"
  | "number"
  | "password"
  | "radio"
  | "range"
  | "reset"
  | "search"
  | "submit"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week";

interface HtmlAttributes extends IntrinsicAttributes {
  accesskey?: string;
  autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
  autocorrect?: "on" | "off";
  autofocus?: BooleanAttribute;
  contenteditable?: BooleanValue | "" | "plaintext-only";
  draggable?: BooleanValue;
  enterkeyhint?:
    | "enter"
    | "done"
    | "go"
    | "next"
    | "previous"
    | "search"
    | "send";
  hidden?: boolean | "" | "hidden" | "until-found";
  inert?: BooleanAttribute;
  inputmode?:
    | "none"
    | "text"
    | "decimal"
    | "numeric"
    | "tel"
    | "search"
    | "email"
    | "url";
  is?: string;
  itemid?: string;
  itemprop?: string;
  itemref?: string;
  itemscope?: BooleanAttribute;
  itemtype?: string;
  nonce?: string;
  part?: string;
  exportparts?: string;
  popover?: "" | "auto" | "manual" | "hint";
  spellcheck?: BooleanValue;
  title?: string;
  translate?: "yes" | "no" | "";
  writingsuggestions?: BooleanValue;
}

interface LinkAttributes {
  download?: string | boolean;
  href?: string;
  hreflang?: string;
  ping?: string;
  referrerpolicy?: ReferrerPolicy;
  rel?: string;
  target?: string;
  type?: string;
}

interface FormOverrideAttributes {
  formaction?: string;
  formenctype?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  formmethod?: "get" | "post" | "dialog";
  formnovalidate?: BooleanAttribute;
  formtarget?: string;
}

interface MediaAttributes {
  autoplay?: BooleanAttribute;
  controls?: BooleanAttribute;
  controlslist?: string;
  crossorigin?: CrossOrigin;
  disableremoteplayback?: BooleanAttribute;
  loop?: BooleanAttribute;
  muted?: BooleanAttribute;
  preload?: "" | "none" | "metadata" | "auto";
  src?: string;
}

// HTML element and attribute inventories: https://html.spec.whatwg.org/multipage/indices.html
interface HtmlElementAttributes {
  a: LinkAttributes;
  abbr: {};
  address: {};
  area: LinkAttributes & {
    alt?: string;
    coords?: string;
    shape?: "default" | "rect" | "circle" | "poly";
  };
  article: {};
  aside: {};
  audio: MediaAttributes;
  b: {};
  base: { href?: string; target?: string };
  bdi: {};
  bdo: {};
  blockquote: { cite?: string };
  body: {};
  br: {};
  button: FormOverrideAttributes & {
    command?: string;
    commandfor?: string;
    disabled?: BooleanAttribute;
    form?: string;
    name?: string;
    popovertarget?: string;
    popovertargetaction?: "hide" | "show" | "toggle";
    type?: "submit" | "reset" | "button";
    value?: string | number;
  };
  canvas: { height?: number | string; width?: number | string };
  caption: {};
  cite: {};
  code: {};
  col: { span?: NumericValue };
  colgroup: { span?: NumericValue };
  data: { value?: string | number };
  datalist: {};
  dd: {};
  del: { cite?: string; datetime?: string };
  details: { name?: string; open?: boolean };
  dfn: {};
  dialog: { closedby?: "any" | "closerequest" | "none"; open?: boolean };
  div: {};
  dl: {};
  dt: {};
  em: {};
  embed: {
    height?: number | string;
    src?: string;
    type?: string;
    width?: number | string;
  };
  fieldset: { disabled?: BooleanAttribute; form?: string; name?: string };
  figcaption: {};
  figure: {};
  footer: {};
  form: {
    acceptCharset?: string;
    action?: string;
    autocomplete?: "on" | "off";
    enctype?:
      | "application/x-www-form-urlencoded"
      | "multipart/form-data"
      | "text/plain";
    method?: "get" | "post" | "dialog";
    name?: string;
    novalidate?: BooleanAttribute;
    rel?: string;
    target?: string;
  };
  h1: {};
  h2: {};
  h3: {};
  h4: {};
  h5: {};
  h6: {};
  head: {};
  header: {};
  hgroup: {};
  hr: {};
  html: { xmlns?: string };
  i: {};
  iframe: {
    allow?: string;
    allowfullscreen?: BooleanAttribute;
    height?: number | string;
    loading?: "eager" | "lazy";
    name?: string;
    referrerpolicy?: ReferrerPolicy;
    sandbox?: string;
    src?: string;
    srcdoc?: string;
    width?: number | string;
  };
  img: {
    alt?: string;
    crossorigin?: CrossOrigin;
    decoding?: "sync" | "async" | "auto";
    fetchpriority?: "high" | "low" | "auto";
    height?: number | string;
    ismap?: BooleanAttribute;
    loading?: "eager" | "lazy";
    referrerpolicy?: ReferrerPolicy;
    sizes?: string;
    src?: string;
    srcset?: string;
    usemap?: string;
    width?: number | string;
  };
  input: FormOverrideAttributes & {
    accept?: string;
    alt?: string;
    autocomplete?: string;
    capture?: boolean | "user" | "environment";
    checked?: BooleanAttribute;
    dirname?: string;
    disabled?: BooleanAttribute;
    form?: string;
    height?: number | string;
    list?: string;
    max?: number | string;
    maxlength?: NumericValue;
    min?: number | string;
    minlength?: NumericValue;
    multiple?: BooleanAttribute;
    name?: string;
    pattern?: string;
    placeholder?: string;
    popovertarget?: string;
    popovertargetaction?: "hide" | "show" | "toggle";
    readonly?: BooleanAttribute;
    required?: BooleanAttribute;
    size?: NumericValue;
    src?: string;
    step?: number | string;
    type?: InputType;
    value?: string | number;
    width?: number | string;
  };
  ins: { cite?: string; datetime?: string };
  kbd: {};
  label: { for?: string };
  legend: {};
  li: { value?: NumericValue };
  link: {
    as?: string;
    blocking?: string;
    crossorigin?: CrossOrigin;
    disabled?: BooleanAttribute;
    fetchpriority?: "high" | "low" | "auto";
    href?: string;
    hreflang?: string;
    imagesizes?: string;
    imagesrcset?: string;
    integrity?: string;
    media?: string;
    referrerpolicy?: ReferrerPolicy;
    rel?: string;
    sizes?: string;
    type?: string;
  };
  main: {};
  map: { name?: string };
  mark: {};
  menu: {};
  meta: {
    charset?: string;
    content?: string;
    httpEquiv?: string;
    media?: string;
    name?: string;
  };
  meter: {
    value?: NumericValue;
    min?: NumericValue;
    max?: NumericValue;
    low?: NumericValue;
    high?: NumericValue;
    optimum?: NumericValue;
  };
  nav: {};
  noscript: {};
  object: {
    data?: string;
    form?: string;
    height?: number | string;
    name?: string;
    type?: string;
    usemap?: string;
    width?: number | string;
  };
  ol: {
    reversed?: BooleanAttribute;
    start?: NumericValue;
    type?: "1" | "a" | "A" | "i" | "I";
  };
  optgroup: { disabled?: BooleanAttribute; label?: string };
  option: {
    disabled?: BooleanAttribute;
    label?: string;
    selected?: BooleanAttribute;
    value?: string | number;
  };
  output: { for?: string; form?: string; name?: string };
  p: {};
  picture: {};
  pre: {};
  progress: { max?: NumericValue; value?: NumericValue };
  q: { cite?: string };
  rp: {};
  rt: {};
  ruby: {};
  s: {};
  samp: {};
  script: {
    async?: BooleanAttribute;
    blocking?: string;
    crossorigin?: CrossOrigin;
    defer?: BooleanAttribute;
    fetchpriority?: "high" | "low" | "auto";
    integrity?: string;
    nomodule?: BooleanAttribute;
    referrerpolicy?: ReferrerPolicy;
    src?: string;
    type?: string;
  };
  search: {};
  section: {};
  select: {
    autocomplete?: string;
    disabled?: BooleanAttribute;
    form?: string;
    multiple?: BooleanAttribute;
    name?: string;
    required?: BooleanAttribute;
    size?: NumericValue;
  };
  selectedcontent: {};
  slot: { name?: string };
  small: {};
  source: {
    height?: number | string;
    media?: string;
    sizes?: string;
    src?: string;
    srcset?: string;
    type?: string;
    width?: number | string;
  };
  span: {};
  strong: {};
  style: { blocking?: string; media?: string; type?: string };
  sub: {};
  summary: {};
  sup: {};
  table: {};
  tbody: {};
  td: { colspan?: NumericValue; headers?: string; rowspan?: NumericValue };
  template: {
    shadowrootclonable?: BooleanAttribute;
    shadowrootdelegatesfocus?: BooleanAttribute;
    shadowrootmode?: "open" | "closed";
    shadowrootserializable?: boolean;
  };
  textarea: {
    autocomplete?: string;
    cols?: NumericValue;
    dirname?: string;
    disabled?: BooleanAttribute;
    form?: string;
    maxlength?: NumericValue;
    minlength?: NumericValue;
    name?: string;
    placeholder?: string;
    readonly?: BooleanAttribute;
    required?: BooleanAttribute;
    rows?: NumericValue;
    wrap?: "hard" | "soft";
  };
  tfoot: {};
  th: {
    abbr?: string;
    colspan?: NumericValue;
    headers?: string;
    rowspan?: NumericValue;
    scope?: "row" | "col" | "rowgroup" | "colgroup";
  };
  thead: {};
  time: { datetime?: string };
  title: {};
  tr: {};
  track: {
    default?: BooleanAttribute;
    kind?: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
    label?: string;
    src?: string;
    srclang?: string;
  };
  u: {};
  ul: {};
  var: {};
  video: MediaAttributes & {
    disablepictureinpicture?: BooleanAttribute;
    height?: number | string;
    playsinline?: BooleanAttribute;
    poster?: string;
    width?: number | string;
  };
  wbr: {};
}

export type HtmlIntrinsics = {
  [Tag in keyof HtmlElementAttributes]: HtmlAttributes &
    HtmlElementAttributes[Tag];
};
