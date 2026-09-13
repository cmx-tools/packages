export const logo = (
  <svg
    viewBox="0 0 120 80"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Coffee"
    role="img"
  >
    <title>Roaster logo</title>
    <desc>A steaming cup</desc>
    <defs>
      <linearGradient
        id="coffee"
        x1="0%"
        x2="100%"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stopColor="brown" />
        <stop offset="100%" stopColor="black" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="40%" fy="40%" />
      <pattern id="beans" width={8} height={8} patternUnits="userSpaceOnUse">
        <circle cx={4} cy={4} r={2} />
      </pattern>
      <marker
        id="arrow"
        markerWidth={10}
        markerHeight={10}
        refX={5}
        refY={5}
        orient="auto"
      >
        <path d="M0 0L10 5L0 10z" />
      </marker>
      <clipPath id="rim">
        <ellipse cx={60} cy={20} rx={30} ry={10} />
      </clipPath>
      <mask id="fade" maskUnits="userSpaceOnUse">
        <rect width={120} height={80} fill="white" />
      </mask>
      <filter
        id="shadow"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
        filterUnits="objectBoundingBox"
      >
        <feGaussianBlur in="SourceAlpha" stdDeviation={2} result="blur" />
        <feOffset in="blur" dx={2} dy={3} result="offset" />
        <feFlood floodColor="black" floodOpacity={0.5} />
        <feComposite in2="offset" operator="in" />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <symbol id="bean" viewBox="0 0 10 10">
        <ellipse cx={5} cy={5} rx={3} ry={5} />
      </symbol>
    </defs>
    <g
      fill="url(#coffee)"
      stroke="black"
      strokeWidth={2}
      strokeLinecap="round"
      transform="translate(5 5)"
    >
      <path id="cup" d="M20 20H80V50Q50 80 20 50Z" pathLength={100} />
      <line x1={20} x2={80} y1={60} y2={60} markerEnd="url(#arrow)" />
      <polyline points="20,10 30,5 40,10" fill="none" />
      <polygon points="60,5 65,10 55,10" />
      <use xlinkHref="#bean" x={90} y={20} />
    </g>
    <a href="/coffee" target="_blank" fill="brown">
      <text x={10} y={75} textLength={100} lengthAdjust="spacing">
        Coffee
        <tspan dx={2} dy={1}>
          !
        </tspan>
      </text>
    </a>
    <text>
      <textPath href="#cup" startOffset="50%" method="align">
        Roasted locally
      </textPath>
    </text>
    <image
      href="/logo.png"
      width={20}
      height={20}
      preserveAspectRatio="xMidYMid meet"
    />
    <foreignObject x={0} y={0} width={20} height={20}>
      <p>CMX</p>
    </foreignObject>
    <circle cx={60} cy={20} r={3}>
      <animate
        attributeName="opacity"
        values="0;1;0"
        dur="2s"
        repeatCount="indefinite"
      />
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0"
        to="360"
        dur="10s"
      />
      <animateMotion dur="5s" rotate="auto">
        <mpath href="#cup" />
      </animateMotion>
      <set attributeName="fill" to="brown" begin="1s" />
    </circle>
  </svg>
);

// @ts-expect-error Misspelled camel-cased SVG attributes are checked.
export const misspelledStroke = <path strokeWitdh={2} />;
// @ts-expect-error Geometry belongs to its declared element.
export const wrongGeometry = <circle d="M0 0" />;
// @ts-expect-error Filter properties belong to filter primitives.
export const wrongFilter = <path stdDeviation={2} />;
// @ts-expect-error Enumerated SVG attributes offer valid choices.
export const wrongLinecap = <path strokeLinecap="rounded" />;
// @ts-expect-error Standard SVG properties cannot contain callbacks.
export const functionRadius = <circle r={() => 10} />;
// @ts-expect-error Even known hyphenated ARIA props check values.
export const wrongAria = <svg aria-hidden="sometimes" />;

export const localizedAnimation = (
  <svg viewBox="0 0 100 100">
    <switch>
      <text systemLanguage="fr">Bonjour</text>
      <text>Hello</text>
    </switch>
    <g systemLanguage="en">
      <circle r={5}>
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur="1s"
          repeatCount="3"
        />
      </circle>
    </g>
  </svg>
);

export const clippedLabel = (
  <svg viewBox="0 0 100 20">
    <text textOverflow="ellipsis" overflow="hidden">
      Fresh coffee, roasted locally
    </text>
  </svg>
);
