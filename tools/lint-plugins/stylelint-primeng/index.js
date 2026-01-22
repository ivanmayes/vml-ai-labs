/**
 * Stylelint Plugin: PrimeNG Design Token Enforcement
 *
 * This plugin enforces proper usage of PrimeNG design tokens and CSS variables
 * to maintain consistency and leverage the PrimeNG theming system.
 *
 * Rules:
 * 1. primeng/use-design-tokens - Enforce PrimeNG CSS variables over hard-coded values
 * 2. primeng/no-hardcoded-colors - Disallow hard-coded colors
 * 3. primeng/no-component-overrides - Warn against direct PrimeNG component class overrides
 * 4. primeng/prefer-semantic-tokens - Prefer semantic tokens over primitive tokens
 * 5. primeng/no-ng-deep - Warn on ::ng-deep usage (deprecated)
 */

// Resolve stylelint from the project that's using this plugin
let stylelint;
try {
  // First try to resolve from the process cwd (where npm run lint is executed)
  stylelint = require(require.resolve("stylelint", { paths: [process.cwd()] }));
} catch {
  // Fallback to regular require (for when installed as dependency)
  stylelint = require("stylelint");
}

const ruleName = (name) => `primeng/${name}`;
const messages = (name) => stylelint.utils.ruleMessages(ruleName(name), {});

// =============================================================================
// PrimeNG Design Token Categories
// =============================================================================

const PRIMENG_COLOR_TOKENS = {
  // Primary colors
  primary: [
    "--p-primary-50",
    "--p-primary-100",
    "--p-primary-200",
    "--p-primary-300",
    "--p-primary-400",
    "--p-primary-500",
    "--p-primary-600",
    "--p-primary-700",
    "--p-primary-800",
    "--p-primary-900",
    "--p-primary-950",
    "--p-primary-color",
    "--p-primary-contrast-color",
  ],

  // Surface colors (semantic)
  surface: [
    "--p-surface-0",
    "--p-surface-50",
    "--p-surface-100",
    "--p-surface-200",
    "--p-surface-300",
    "--p-surface-400",
    "--p-surface-500",
    "--p-surface-600",
    "--p-surface-700",
    "--p-surface-800",
    "--p-surface-900",
    "--p-surface-950",
    "--p-surface-ground",
    "--p-surface-section",
    "--p-surface-card",
    "--p-surface-overlay",
    "--p-surface-border",
  ],

  // Text colors (semantic)
  text: ["--p-text-color", "--p-text-secondary-color", "--p-text-muted-color"],

  // Semantic status colors
  status: [
    "--p-green-50",
    "--p-green-100",
    "--p-green-200",
    "--p-green-300",
    "--p-green-400",
    "--p-green-500",
    "--p-green-600",
    "--p-green-700",
    "--p-green-800",
    "--p-green-900",
    "--p-red-50",
    "--p-red-100",
    "--p-red-200",
    "--p-red-300",
    "--p-red-400",
    "--p-red-500",
    "--p-red-600",
    "--p-red-700",
    "--p-red-800",
    "--p-red-900",
    "--p-orange-50",
    "--p-orange-100",
    "--p-orange-200",
    "--p-orange-300",
    "--p-orange-400",
    "--p-orange-500",
    "--p-orange-600",
    "--p-orange-700",
    "--p-orange-800",
    "--p-orange-900",
    "--p-yellow-50",
    "--p-yellow-100",
    "--p-yellow-200",
    "--p-yellow-300",
    "--p-yellow-400",
    "--p-yellow-500",
    "--p-yellow-600",
    "--p-yellow-700",
    "--p-yellow-800",
    "--p-yellow-900",
    "--p-blue-50",
    "--p-blue-100",
    "--p-blue-200",
    "--p-blue-300",
    "--p-blue-400",
    "--p-blue-500",
    "--p-blue-600",
    "--p-blue-700",
    "--p-blue-800",
    "--p-blue-900",
  ],
};

const PRIMENG_SPACING_TOKENS = [
  "--p-button-padding-x",
  "--p-button-padding-y",
  "--p-inputtext-padding-x",
  "--p-inputtext-padding-y",
  "--p-form-field-padding-x",
  "--p-form-field-padding-y",
];

const PRIMENG_BORDER_TOKENS = [
  "--p-border-radius",
  "--p-rounded-border-radius",
  "--p-button-border-radius",
  "--p-inputtext-border-radius",
];

const PRIMENG_FONT_TOKENS = ["--p-font-family", "--p-font-size"];

// All valid PrimeNG CSS variables (prefix)
const PRIMENG_VAR_PREFIX = "--p-";

// PrimeNG component classes that should not be directly overridden
const PRIMENG_COMPONENT_CLASSES = [
  ".p-button",
  ".p-inputtext",
  ".p-dialog",
  ".p-card",
  ".p-table",
  ".p-datatable",
  ".p-dropdown",
  ".p-multiselect",
  ".p-checkbox",
  ".p-radiobutton",
  ".p-toast",
  ".p-menu",
  ".p-menuitem",
  ".p-panel",
  ".p-accordion",
  ".p-tabview",
  ".p-toolbar",
  ".p-tooltip",
  ".p-popover",
  ".p-overlay",
  ".p-drawer",
  ".p-sidebar",
  ".p-paginator",
  ".p-tree",
  ".p-listbox",
  ".p-chips",
  ".p-autocomplete",
  ".p-slider",
  ".p-rating",
  ".p-fileupload",
  ".p-progressbar",
  ".p-avatar",
  ".p-badge",
  ".p-tag",
  ".p-message",
  ".p-confirmdialog",
  ".p-overlaypanel",
];

// CSS color keywords to disallow
const CSS_COLOR_KEYWORDS = [
  "black",
  "white",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "brown",
  "cyan",
  "magenta",
  "lime",
  "maroon",
  "navy",
  "olive",
  "silver",
  "teal",
  "aqua",
  "fuchsia",
  "transparent",
  "currentColor",
  "aliceblue",
  "antiquewhite",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "blanchedalmond",
  "blueviolet",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "greenyellow",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "limegreen",
  "linen",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "oldlace",
  "olivedrab",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "plum",
  "powderblue",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "whitesmoke",
  "yellowgreen",
  "rebeccapurple",
];

// Properties that commonly use colors
const COLOR_PROPERTIES = [
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "caret-color",
  "column-rule-color",
  "text-decoration-color",
];

// =============================================================================
// Rule: primeng/no-hardcoded-colors
// =============================================================================

const noHardcodedColorsRule = stylelint.createPlugin(
  ruleName("no-hardcoded-colors"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("no-hardcoded-colors"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      const allowedPatterns = secondaryOptions?.allowedPatterns || [];
      const allowTransparent = secondaryOptions?.allowTransparent ?? true;
      const allowCurrentColor = secondaryOptions?.allowCurrentColor ?? true;

      root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        const value = decl.value;

        // Skip if property doesn't typically use colors
        if (!COLOR_PROPERTIES.some((cp) => prop.includes(cp))) {
          return;
        }

        // Skip if value uses CSS variable
        if (value.includes("var(--p-")) {
          return;
        }

        // Check for allowed patterns
        if (
          allowedPatterns.some((pattern) => new RegExp(pattern).test(value))
        ) {
          return;
        }

        // Check for hex colors
        const hexPattern =
          /#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
        if (hexPattern.test(value)) {
          stylelint.utils.report({
            message: `Avoid hard-coded hex color "${value}". Use PrimeNG design tokens instead (e.g., var(--p-primary-500), var(--p-surface-100), var(--p-text-color)).`,
            node: decl,
            result,
            ruleName: ruleName("no-hardcoded-colors"),
          });
          return;
        }

        // Check for rgb/rgba/hsl/hsla
        const colorFunctionPattern = /\b(rgb|rgba|hsl|hsla)\s*\(/i;
        if (colorFunctionPattern.test(value)) {
          stylelint.utils.report({
            message: `Avoid hard-coded color function "${value}". Use PrimeNG design tokens instead (e.g., var(--p-primary-500), var(--p-surface-100)).`,
            node: decl,
            result,
            ruleName: ruleName("no-hardcoded-colors"),
          });
          return;
        }

        // Check for color keywords
        const valueLower = value.toLowerCase();
        for (const keyword of CSS_COLOR_KEYWORDS) {
          // Skip transparent and currentColor if allowed
          if (allowTransparent && keyword === "transparent") continue;
          if (allowCurrentColor && keyword === "currentcolor") continue;

          // Check if keyword is used as a standalone word
          const keywordPattern = new RegExp(`\\b${keyword}\\b`, "i");
          if (keywordPattern.test(valueLower)) {
            stylelint.utils.report({
              message: `Avoid color keyword "${keyword}". Use PrimeNG design tokens instead (e.g., var(--p-text-color), var(--p-surface-0)).`,
              node: decl,
              result,
              ruleName: ruleName("no-hardcoded-colors"),
            });
            return;
          }
        }
      });
    };
  },
);

// =============================================================================
// Rule: primeng/use-design-tokens
// =============================================================================

const useDesignTokensRule = stylelint.createPlugin(
  ruleName("use-design-tokens"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("use-design-tokens"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      root.walkDecls((decl) => {
        const value = decl.value;

        // Check if using a CSS variable that doesn't have --p- prefix but looks like it should
        const varPattern = /var\(--([a-z][a-z0-9-]*)\)/gi;
        let match;

        while ((match = varPattern.exec(value)) !== null) {
          const varName = match[1];

          // Skip if it already has p- prefix
          if (varName.startsWith("p-")) continue;

          // Check for common patterns that should use PrimeNG tokens
          const shouldBePrimeng = [
            "text-color",
            "surface",
            "primary",
            "border-radius",
            "font-family",
            "font-size",
            "button",
            "input",
            "form-field",
          ].some((pattern) => varName.includes(pattern));

          if (shouldBePrimeng) {
            stylelint.utils.report({
              message: `CSS variable "--${varName}" appears to be a design token. Use the PrimeNG prefixed version "--p-${varName}" instead.`,
              node: decl,
              result,
              ruleName: ruleName("use-design-tokens"),
            });
          }
        }
      });
    };
  },
);

// =============================================================================
// Rule: primeng/no-component-overrides
// =============================================================================

const noComponentOverridesRule = stylelint.createPlugin(
  ruleName("no-component-overrides"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("no-component-overrides"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      const severity = secondaryOptions?.severity || "warning";
      const allowedOverrides = secondaryOptions?.allowedOverrides || [];

      root.walkRules((rule) => {
        const selector = rule.selector;

        // Check if the rule directly targets a PrimeNG component class
        for (const componentClass of PRIMENG_COMPONENT_CLASSES) {
          // Skip if in allowed overrides
          if (allowedOverrides.some((allowed) => selector.includes(allowed))) {
            continue;
          }

          // Check for direct class targeting (not nested within host or ng-deep)
          if (
            selector.startsWith(componentClass) ||
            selector.includes(` ${componentClass}`) ||
            selector.includes(`>${componentClass}`) ||
            selector.includes(`,${componentClass}`)
          ) {
            // Allow if it's within :host or uses CSS variables
            const parent = rule.parent;
            const isWithinHost = parent?.selector?.includes(":host");
            const usesOnlyVars = rule.nodes.every(
              (node) => node.type !== "decl" || node.value.includes("var(--p-"),
            );

            if (!isWithinHost && !usesOnlyVars) {
              stylelint.utils.report({
                message: `Avoid directly overriding PrimeNG component class "${componentClass}". Use design tokens via CSS variables or the component's [dt] property for scoped customization.`,
                node: rule,
                result,
                ruleName: ruleName("no-component-overrides"),
                severity,
              });
            }
          }
        }
      });
    };
  },
);

// =============================================================================
// Rule: primeng/no-ng-deep
// =============================================================================

const noNgDeepRule = stylelint.createPlugin(
  ruleName("no-ng-deep"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("no-ng-deep"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      const severity = secondaryOptions?.severity || "warning";

      root.walkRules((rule) => {
        const selector = rule.selector;

        if (
          selector.includes("::ng-deep") ||
          selector.includes("/deep/") ||
          selector.includes(">>>")
        ) {
          stylelint.utils.report({
            message: `Avoid using "::ng-deep" (deprecated). Consider using PrimeNG's [dt] property for scoped design token overrides, or CSS variables in component styles.`,
            node: rule,
            result,
            ruleName: ruleName("no-ng-deep"),
            severity,
          });
        }
      });
    };
  },
);

// =============================================================================
// Rule: primeng/prefer-semantic-tokens
// =============================================================================

const preferSemanticTokensRule = stylelint.createPlugin(
  ruleName("prefer-semantic-tokens"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("prefer-semantic-tokens"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      // Map of primitive tokens to suggested semantic alternatives
      const primitiveToSemantic = {
        "--p-gray-": {
          suggest: "--p-surface-",
          message:
            "Use semantic surface tokens (--p-surface-*) for backgrounds and borders.",
        },
        "--p-slate-": {
          suggest: "--p-surface-",
          message:
            "Use semantic surface tokens (--p-surface-*) for backgrounds and borders.",
        },
        "--p-zinc-": {
          suggest: "--p-surface-",
          message:
            "Use semantic surface tokens (--p-surface-*) for backgrounds and borders.",
        },
        "--p-neutral-": {
          suggest: "--p-surface-",
          message:
            "Use semantic surface tokens (--p-surface-*) for backgrounds and borders.",
        },
        "--p-stone-": {
          suggest: "--p-surface-",
          message:
            "Use semantic surface tokens (--p-surface-*) for backgrounds and borders.",
        },
      };

      root.walkDecls((decl) => {
        const value = decl.value;

        for (const [primitive, { suggest, message }] of Object.entries(
          primitiveToSemantic,
        )) {
          if (value.includes(primitive)) {
            stylelint.utils.report({
              message: `Consider using semantic tokens instead of primitive tokens. ${message}`,
              node: decl,
              result,
              ruleName: ruleName("prefer-semantic-tokens"),
              severity: "warning",
            });
          }
        }
      });
    };
  },
);

// =============================================================================
// Rule: primeng/consistent-spacing
// =============================================================================

const consistentSpacingRule = stylelint.createPlugin(
  ruleName("consistent-spacing"),
  (primaryOption, secondaryOptions, context) => {
    return (root, result) => {
      const validOptions = stylelint.utils.validateOptions(
        result,
        ruleName("consistent-spacing"),
        {
          actual: primaryOption,
        },
      );

      if (!validOptions) return;

      const allowedValues = secondaryOptions?.allowedValues || [
        "0",
        "0.125rem",
        "0.25rem",
        "0.375rem",
        "0.5rem",
        "0.625rem",
        "0.75rem",
        "0.875rem",
        "1rem",
        "1.25rem",
        "1.5rem",
        "1.75rem",
        "2rem",
        "2.5rem",
        "3rem",
        "4rem",
        "auto",
        "inherit",
        "initial",
        "unset",
      ];

      const spacingProperties = [
        "margin",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "gap",
        "row-gap",
        "column-gap",
        "grid-gap",
      ];

      root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        const value = decl.value;

        if (!spacingProperties.includes(prop)) return;

        // Skip if using CSS variables
        if (value.includes("var(")) return;

        // Split value for shorthand properties
        const values = value.split(/\s+/);

        for (const val of values) {
          // Skip allowed values
          if (allowedValues.includes(val)) continue;

          // Skip calc() expressions
          if (val.includes("calc(")) continue;

          // Check for px values (should use rem)
          if (/^\d+px$/.test(val)) {
            stylelint.utils.report({
              message: `Use rem units instead of px for spacing: "${val}". PrimeNG uses rem for scalable sizing. Consider using a value from the spacing scale or a design token.`,
              node: decl,
              result,
              ruleName: ruleName("consistent-spacing"),
              severity: "warning",
            });
          }
        }
      });
    };
  },
);

// =============================================================================
// Export all rules
// =============================================================================

module.exports = [
  noHardcodedColorsRule,
  useDesignTokensRule,
  noComponentOverridesRule,
  noNgDeepRule,
  preferSemanticTokensRule,
  consistentSpacingRule,
];

// Also export rules object for easier access
module.exports.rules = {
  "no-hardcoded-colors": noHardcodedColorsRule,
  "use-design-tokens": useDesignTokensRule,
  "no-component-overrides": noComponentOverridesRule,
  "no-ng-deep": noNgDeepRule,
  "prefer-semantic-tokens": preferSemanticTokensRule,
  "consistent-spacing": consistentSpacingRule,
};
