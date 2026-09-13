type BooleanValue = boolean | "true" | "false";

// WAI-ARIA states and properties: https://www.w3.org/TR/wai-aria-1.2/#state_prop_def
export interface AriaAttributes {
  "aria-activedescendant"?: string;
  "aria-atomic"?: BooleanValue;
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  "aria-braillelabel"?: string;
  "aria-brailleroledescription"?: string;
  "aria-busy"?: BooleanValue;
  "aria-checked"?: BooleanValue | "mixed";
  "aria-colcount"?: number | `${number}`;
  "aria-colindex"?: number | `${number}`;
  "aria-colindextext"?: string;
  "aria-colspan"?: number | `${number}`;
  "aria-controls"?: string;
  "aria-current"?:
    | BooleanValue
    | "page"
    | "step"
    | "location"
    | "date"
    | "time";
  "aria-describedby"?: string;
  "aria-description"?: string;
  "aria-details"?: string;
  "aria-disabled"?: BooleanValue;
  "aria-dropeffect"?: "none" | "copy" | "execute" | "link" | "move" | "popup";
  "aria-errormessage"?: string;
  "aria-expanded"?: BooleanValue;
  "aria-flowto"?: string;
  "aria-grabbed"?: BooleanValue;
  "aria-haspopup"?:
    | BooleanValue
    | "menu"
    | "listbox"
    | "tree"
    | "grid"
    | "dialog";
  "aria-hidden"?: BooleanValue;
  "aria-invalid"?: BooleanValue | "grammar" | "spelling";
  "aria-keyshortcuts"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-level"?: number | `${number}`;
  "aria-live"?: "off" | "assertive" | "polite";
  "aria-modal"?: BooleanValue;
  "aria-multiline"?: BooleanValue;
  "aria-multiselectable"?: BooleanValue;
  "aria-orientation"?: "horizontal" | "undefined" | "vertical";
  "aria-owns"?: string;
  "aria-placeholder"?: string;
  "aria-posinset"?: number | `${number}`;
  "aria-pressed"?: BooleanValue | "mixed";
  "aria-readonly"?: BooleanValue;
  "aria-relevant"?: string;
  "aria-required"?: BooleanValue;
  "aria-roledescription"?: string;
  "aria-rowcount"?: number | `${number}`;
  "aria-rowindex"?: number | `${number}`;
  "aria-rowindextext"?: string;
  "aria-rowspan"?: number | `${number}`;
  "aria-selected"?: BooleanValue;
  "aria-setsize"?: number | `${number}`;
  "aria-sort"?: "none" | "ascending" | "descending" | "other";
  "aria-valuemax"?: number | `${number}`;
  "aria-valuemin"?: number | `${number}`;
  "aria-valuenow"?: number | `${number}`;
  "aria-valuetext"?: string;
}
