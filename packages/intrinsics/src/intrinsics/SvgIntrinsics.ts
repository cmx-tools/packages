import type { Properties } from "csstype";
import type { IntrinsicAttributes } from "./IntrinsicAttributes.js";

type Length = number | string;
type CoordinateSystem = "userSpaceOnUse" | "objectBoundingBox";
type PresentationAttributes = Pick<
  Properties<string | number>,
  | "alignmentBaseline"
  | "baselineShift"
  | "clip"
  | "clipPath"
  | "clipRule"
  | "color"
  | "colorInterpolation"
  | "colorInterpolationFilters"
  | "colorRendering"
  | "cursor"
  | "direction"
  | "display"
  | "dominantBaseline"
  | "fill"
  | "fillOpacity"
  | "fillRule"
  | "filter"
  | "floodColor"
  | "floodOpacity"
  | "fontFamily"
  | "fontSize"
  | "fontSizeAdjust"
  | "fontStretch"
  | "fontStyle"
  | "fontVariant"
  | "fontWeight"
  | "imageRendering"
  | "letterSpacing"
  | "lightingColor"
  | "markerEnd"
  | "markerMid"
  | "markerStart"
  | "mask"
  | "opacity"
  | "overflow"
  | "paintOrder"
  | "pointerEvents"
  | "shapeRendering"
  | "stopColor"
  | "stopOpacity"
  | "stroke"
  | "strokeDasharray"
  | "strokeDashoffset"
  | "strokeLinecap"
  | "strokeLinejoin"
  | "strokeMiterlimit"
  | "strokeOpacity"
  | "strokeWidth"
  | "textAnchor"
  | "textDecoration"
  | "textOverflow"
  | "textRendering"
  | "transform"
  | "transformOrigin"
  | "unicodeBidi"
  | "vectorEffect"
  | "visibility"
  | "whiteSpace"
  | "wordSpacing"
  | "writingMode"
>;

interface SvgAttributes extends IntrinsicAttributes, PresentationAttributes {
  autofocus?: boolean;
  requiredExtensions?: string;
  systemLanguage?: string;
  focusable?: boolean | "true" | "false" | "auto";
  xmlBase?: string;
  xmlLang?: string;
  xmlSpace?: "default" | "preserve";
  xmlns?: string;
  xmlnsXlink?: string;
}

interface ReferenceAttributes {
  href?: string;
  xlinkHref?: string;
  xlinkActuate?: "onLoad" | "onRequest" | "other" | "none";
  xlinkArcrole?: string;
  xlinkRole?: string;
  xlinkShow?: "new" | "replace" | "embed" | "other" | "none";
  xlinkTitle?: string;
  xlinkType?: "simple";
}

interface RegionAttributes {
  x?: Length;
  y?: Length;
  width?: Length;
  height?: Length;
}

interface ViewAttributes {
  viewBox?: string;
  preserveAspectRatio?: string;
}

interface FilterPrimitiveAttributes extends RegionAttributes {
  result?: string;
}

interface FilterInputAttributes extends FilterPrimitiveAttributes {
  in?: string;
}

interface FilterLightAttributes {
  surfaceScale?: number | string;
  kernelUnitLength?: number | string;
}

interface TransferFunctionAttributes {
  type?: "identity" | "table" | "discrete" | "linear" | "gamma";
  tableValues?: string;
  slope?: number | string;
  intercept?: number | string;
  amplitude?: number | string;
  exponent?: number | string;
  offset?: number | string;
}

interface TimingAttributes {
  begin?: number | string;
  dur?: number | string;
  end?: number | string;
  min?: number | string;
  max?: number | string;
  restart?: "always" | "whenNotActive" | "never";
  repeatCount?: number | `${number}` | "indefinite";
  repeatDur?: number | string;
  fill?: "freeze" | "remove";
}

interface AnimationValueAttributes {
  calcMode?: "discrete" | "linear" | "paced" | "spline";
  values?: string;
  keyTimes?: string;
  keySplines?: string;
  from?: number | string;
  to?: number | string;
  by?: number | string;
  additive?: "replace" | "sum";
  accumulate?: "none" | "sum";
}

interface AttributeTarget {
  attributeName?: string;
  attributeType?: "CSS" | "XML" | "auto";
}

interface TextPositionAttributes {
  x?: Length;
  y?: Length;
  dx?: Length;
  dy?: Length;
  rotate?: number | string;
  textLength?: Length;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
}

interface GradientAttributes extends ReferenceAttributes {
  gradientUnits?: CoordinateSystem;
  gradientTransform?: string;
  spreadMethod?: "pad" | "reflect" | "repeat";
}

// SVG element and attribute inventories: https://www.w3.org/TR/SVG2/eltindex.html
interface SvgElementAttributes {
  a: ReferenceAttributes & {
    download?: string | boolean;
    hreflang?: string;
    ping?: string;
    referrerpolicy?: string;
    rel?: string;
    target?: string;
    type?: string;
  };
  animate: ReferenceAttributes &
    AttributeTarget &
    TimingAttributes &
    AnimationValueAttributes;
  animateMotion: ReferenceAttributes &
    TimingAttributes &
    AnimationValueAttributes & {
      path?: string;
      keyPoints?: string;
      rotate?: number | string;
      origin?: string;
    };
  animateTransform: ReferenceAttributes &
    AttributeTarget &
    TimingAttributes &
    AnimationValueAttributes & {
      type?: "translate" | "scale" | "rotate" | "skewX" | "skewY";
    };
  circle: {
    cx?: Length;
    cy?: Length;
    r?: Length;
    pathLength?: number | string;
  };
  clipPath: { clipPathUnits?: CoordinateSystem };
  defs: {};
  desc: {};
  discard: ReferenceAttributes & { begin?: number | string };
  ellipse: {
    cx?: Length;
    cy?: Length;
    rx?: Length;
    ry?: Length;
    pathLength?: number | string;
  };
  feBlend: FilterInputAttributes & {
    in2?: string;
    mode?:
      | "normal"
      | "multiply"
      | "screen"
      | "darken"
      | "lighten"
      | "overlay"
      | "color-dodge"
      | "color-burn"
      | "hard-light"
      | "soft-light"
      | "difference"
      | "exclusion"
      | "hue"
      | "saturation"
      | "color"
      | "luminosity";
  };
  feColorMatrix: FilterInputAttributes & {
    type?: "matrix" | "saturate" | "hueRotate" | "luminanceToAlpha";
    values?: number | string;
  };
  feComponentTransfer: FilterInputAttributes;
  feComposite: FilterInputAttributes & {
    in2?: string;
    operator?:
      | "over"
      | "in"
      | "out"
      | "atop"
      | "xor"
      | "lighter"
      | "arithmetic";
    k1?: number | string;
    k2?: number | string;
    k3?: number | string;
    k4?: number | string;
  };
  feConvolveMatrix: FilterInputAttributes & {
    order?: number | string;
    kernelMatrix?: string;
    divisor?: number | string;
    bias?: number | string;
    targetX?: number | string;
    targetY?: number | string;
    edgeMode?: "duplicate" | "wrap" | "none";
    kernelUnitLength?: number | string;
    preserveAlpha?: boolean | "true" | "false";
  };
  feDiffuseLighting: FilterInputAttributes &
    FilterLightAttributes & { diffuseConstant?: number | string };
  feDisplacementMap: FilterInputAttributes & {
    in2?: string;
    scale?: number | string;
    xChannelSelector?: "R" | "G" | "B" | "A";
    yChannelSelector?: "R" | "G" | "B" | "A";
  };
  feDistantLight: { azimuth?: number | string; elevation?: number | string };
  feDropShadow: FilterInputAttributes & {
    dx?: number | string;
    dy?: number | string;
    stdDeviation?: number | string;
  };
  feFlood: FilterPrimitiveAttributes;
  feFuncA: TransferFunctionAttributes;
  feFuncB: TransferFunctionAttributes;
  feFuncG: TransferFunctionAttributes;
  feFuncR: TransferFunctionAttributes;
  feGaussianBlur: FilterInputAttributes & {
    stdDeviation?: number | string;
    edgeMode?: "duplicate" | "wrap" | "none";
  };
  feImage: FilterPrimitiveAttributes &
    ReferenceAttributes &
    ViewAttributes & { crossorigin?: "" | "anonymous" | "use-credentials" };
  feMerge: FilterPrimitiveAttributes;
  feMergeNode: { in?: string };
  feMorphology: FilterInputAttributes & {
    operator?: "erode" | "dilate";
    radius?: number | string;
  };
  feOffset: FilterInputAttributes & {
    dx?: number | string;
    dy?: number | string;
  };
  fePointLight: {
    x?: number | string;
    y?: number | string;
    z?: number | string;
  };
  feSpecularLighting: FilterInputAttributes &
    FilterLightAttributes & {
      specularConstant?: number | string;
      specularExponent?: number | string;
    };
  feSpotLight: {
    x?: number | string;
    y?: number | string;
    z?: number | string;
    pointsAtX?: number | string;
    pointsAtY?: number | string;
    pointsAtZ?: number | string;
    specularExponent?: number | string;
    limitingConeAngle?: number | string;
  };
  feTile: FilterInputAttributes;
  feTurbulence: FilterPrimitiveAttributes & {
    baseFrequency?: number | string;
    numOctaves?: number | string;
    seed?: number | string;
    stitchTiles?: "stitch" | "noStitch";
    type?: "fractalNoise" | "turbulence";
  };
  filter: RegionAttributes &
    ReferenceAttributes & {
      filterUnits?: CoordinateSystem;
      primitiveUnits?: CoordinateSystem;
    };
  foreignObject: RegionAttributes;
  g: {};
  image: RegionAttributes &
    ReferenceAttributes &
    ViewAttributes & {
      crossorigin?: "" | "anonymous" | "use-credentials";
      decoding?: "sync" | "async" | "auto";
    };
  line: {
    x1?: Length;
    x2?: Length;
    y1?: Length;
    y2?: Length;
    pathLength?: number | string;
  };
  linearGradient: GradientAttributes & {
    x1?: Length;
    x2?: Length;
    y1?: Length;
    y2?: Length;
  };
  marker: ViewAttributes & {
    markerUnits?: "strokeWidth" | "userSpaceOnUse";
    markerWidth?: Length;
    markerHeight?: Length;
    refX?: Length;
    refY?: Length;
    orient?: number | string;
  };
  mask: RegionAttributes & {
    maskUnits?: CoordinateSystem;
    maskContentUnits?: CoordinateSystem;
    maskType?: "luminance" | "alpha";
  };
  metadata: {};
  mpath: ReferenceAttributes;
  path: { d?: string; pathLength?: number | string };
  pattern: RegionAttributes &
    ReferenceAttributes &
    ViewAttributes & {
      patternUnits?: CoordinateSystem;
      patternContentUnits?: CoordinateSystem;
      patternTransform?: string;
    };
  polygon: { points?: string; pathLength?: number | string };
  polyline: { points?: string; pathLength?: number | string };
  radialGradient: GradientAttributes & {
    cx?: Length;
    cy?: Length;
    r?: Length;
    fx?: Length;
    fy?: Length;
    fr?: Length;
  };
  rect: RegionAttributes & {
    rx?: Length;
    ry?: Length;
    pathLength?: number | string;
  };
  script: ReferenceAttributes & {
    type?: string;
    crossorigin?: "" | "anonymous" | "use-credentials";
  };
  set: ReferenceAttributes &
    AttributeTarget &
    TimingAttributes & { to?: number | string };
  stop: { offset?: number | string };
  style: { type?: string; media?: string; title?: string };
  svg: RegionAttributes &
    ViewAttributes & {
      version?: string;
      baseProfile?: string;
      zoomAndPan?: "disable" | "magnify";
    };
  switch: {};
  symbol: RegionAttributes & ViewAttributes & { refX?: Length; refY?: Length };
  text: TextPositionAttributes;
  textPath: ReferenceAttributes & {
    startOffset?: Length;
    method?: "align" | "stretch";
    spacing?: "auto" | "exact";
    side?: "left" | "right";
    textLength?: Length;
    lengthAdjust?: "spacing" | "spacingAndGlyphs";
    path?: string;
  };
  title: {};
  tspan: TextPositionAttributes;
  use: RegionAttributes & ReferenceAttributes;
  view: ViewAttributes & {
    viewTarget?: string;
    zoomAndPan?: "disable" | "magnify";
  };
}

export type SvgIntrinsics = {
  [Tag in keyof SvgElementAttributes]: Omit<
    SvgAttributes,
    keyof SvgElementAttributes[Tag]
  > &
    SvgElementAttributes[Tag];
};
