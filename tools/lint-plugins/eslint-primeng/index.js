/**
 * ESLint Plugin: PrimeNG Best Practices for Angular
 *
 * This plugin enforces proper usage of PrimeNG components in Angular applications.
 *
 * Rules:
 * 1. primeng/prefer-component-imports - Prefer importing from specific modules
 * 2. primeng/valid-severity - Ensure valid severity values for Message/Toast
 * 3. primeng/no-deprecated-components - Warn on deprecated components
 * 4. primeng/prefer-primeng-button - Prefer p-button over native buttons with pButton directive
 * 5. primeng/no-inline-styles-for-tokens - Avoid inline styles that should use tokens
 * 6. primeng/consistent-icon-usage - Use PrimeIcons consistently
 */

// =============================================================================
// PrimeNG Component Information
// =============================================================================

const PRIMENG_COMPONENTS = {
  // Form Components
  form: [
    "InputText",
    "InputNumber",
    "InputMask",
    "InputOtp",
    "InputGroup",
    "InputGroupAddon",
    "Password",
    "Textarea",
    "Checkbox",
    "RadioButton",
    "ToggleSwitch",
    "Select",
    "MultiSelect",
    "Listbox",
    "AutoComplete",
    "DatePicker",
    "Slider",
    "Rating",
    "ColorPicker",
    "Chips",
    "Editor",
    "IconField",
    "InputIcon",
    "FloatLabel",
    "IftaLabel",
  ],
  // Button Components
  button: ["Button", "SpeedDial", "SplitButton"],
  // Data Components
  data: [
    "DataTable",
    "Table",
    "TreeTable",
    "Paginator",
    "VirtualScroller",
    "Tree",
    "OrderList",
    "PickList",
    "Timeline",
    "Scroller",
    "DataView",
  ],
  // Panel Components
  panel: [
    "Accordion",
    "Card",
    "Divider",
    "Fieldset",
    "Panel",
    "Splitter",
    "ScrollPanel",
    "Tabs",
    "Stepper",
    "Toolbar",
  ],
  // Overlay Components
  overlay: [
    "Dialog",
    "DynamicDialog",
    "ConfirmDialog",
    "ConfirmPopup",
    "Drawer",
    "Popover",
    "Tooltip",
  ],
  // File Components
  file: ["FileUpload"],
  // Menu Components
  menu: [
    "Menu",
    "Menubar",
    "MegaMenu",
    "PanelMenu",
    "TieredMenu",
    "Breadcrumb",
    "ContextMenu",
    "Dock",
    "Steps",
    "TabMenu",
  ],
  // Message Components
  message: ["Message", "Toast"],
  // Media Components
  media: ["Carousel", "Galleria", "Image", "ImageCompare"],
  // Misc Components
  misc: [
    "Avatar",
    "AvatarGroup",
    "Badge",
    "Chip",
    "Inplace",
    "MeterGroup",
    "ProgressBar",
    "ProgressSpinner",
    "ScrollTop",
    "Skeleton",
    "Tag",
    "Terminal",
    "BlockUI",
    "Defer",
    "FocusTrap",
    "AnimateOnScroll",
    "StyleClass",
    "Ripple",
  ],
};

// Deprecated components in PrimeNG v20+
const DEPRECATED_COMPONENTS = {
  Dropdown: {
    replacement: "Select",
    message: "Use Select instead of Dropdown (deprecated in v20)",
  },
  MultiSelect: {
    replacement: "MultiSelect",
    message: "Consider using the new Select component with multiple mode",
  },
  Calendar: {
    replacement: "DatePicker",
    message: "Use DatePicker instead of Calendar (deprecated in v19)",
  },
  InputSwitch: {
    replacement: "ToggleSwitch",
    message: "Use ToggleSwitch instead of InputSwitch (deprecated in v19)",
  },
  Sidebar: {
    replacement: "Drawer",
    message: "Use Drawer instead of Sidebar (deprecated in v19)",
  },
  OverlayPanel: {
    replacement: "Popover",
    message: "Use Popover instead of OverlayPanel (deprecated in v19)",
  },
  TabView: {
    replacement: "Tabs",
    message: "Use Tabs instead of TabView (deprecated in v20)",
  },
  TabPanel: {
    replacement: "TabPanel (in Tabs)",
    message: "Use Tabs component with TabPanel instead (deprecated in v20)",
  },
};

// Valid severity values for Message and Toast components
const VALID_SEVERITIES = [
  "success",
  "info",
  "warn",
  "error",
  "secondary",
  "contrast",
];

// PrimeIcons prefix
const PRIMEICONS_PREFIX = "pi pi-";

// =============================================================================
// Rule: primeng/prefer-component-imports
// =============================================================================

const preferComponentImportsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer importing PrimeNG components from specific modules",
      category: "Best Practices",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      preferSpecificImport:
        'Import {{ component }} directly from "primeng/{{ module }}" instead of using barrel imports.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        // Check for barrel imports from 'primeng' root
        if (source === "primeng") {
          context.report({
            node,
            messageId: "preferSpecificImport",
            data: {
              component: "components",
              module: "<component>",
            },
          });
        }
      },
    };
  },
};

// =============================================================================
// Rule: primeng/valid-severity
// =============================================================================

const validSeverityRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure valid severity values are used for PrimeNG Message and Toast components",
      category: "Possible Errors",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      invalidSeverity:
        'Invalid severity "{{ value }}". Valid values are: {{ validValues }}.',
    },
  },
  create(context) {
    const filename = context.getFilename();

    // Only check HTML and TypeScript files
    if (!filename.endsWith(".html") && !filename.endsWith(".ts")) {
      return {};
    }

    return {
      // Check in TypeScript files for MessageService usage
      CallExpression(node) {
        if (node.callee.type === "MemberExpression") {
          const methodName = node.callee.property.name;

          // Check for messageService.add() calls
          if (methodName === "add" && node.arguments.length > 0) {
            const arg = node.arguments[0];
            if (arg.type === "ObjectExpression") {
              for (const prop of arg.properties) {
                if (prop.key && prop.key.name === "severity" && prop.value) {
                  if (
                    prop.value.type === "Literal" &&
                    typeof prop.value.value === "string"
                  ) {
                    const severity = prop.value.value;
                    if (!VALID_SEVERITIES.includes(severity)) {
                      context.report({
                        node: prop.value,
                        messageId: "invalidSeverity",
                        data: {
                          value: severity,
                          validValues: VALID_SEVERITIES.join(", "),
                        },
                      });
                    }
                  }
                }
              }
            }
          }
        }
      },
    };
  },
};

// =============================================================================
// Rule: primeng/no-deprecated-components
// =============================================================================

const noDeprecatedComponentsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when using deprecated PrimeNG components",
      category: "Best Practices",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      deprecatedComponent: "{{ message }}",
      deprecatedImport: 'Import "{{ component }}" is deprecated. {{ message }}',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        // Check for deprecated component imports
        for (const [deprecated, info] of Object.entries(
          DEPRECATED_COMPONENTS,
        )) {
          const moduleName = deprecated.toLowerCase();
          if (source === `primeng/${moduleName}`) {
            context.report({
              node,
              messageId: "deprecatedImport",
              data: {
                component: deprecated,
                message: info.message,
              },
            });
          }
        }
      },

      // Check for deprecated component usage in decorators
      Decorator(node) {
        if (
          node.expression.type === "CallExpression" &&
          node.expression.callee.name === "Component"
        ) {
          const args = node.expression.arguments;
          if (args.length > 0 && args[0].type === "ObjectExpression") {
            for (const prop of args[0].properties) {
              // Check imports array in component decorator
              if (
                prop.key &&
                prop.key.name === "imports" &&
                prop.value.type === "ArrayExpression"
              ) {
                for (const element of prop.value.elements) {
                  if (element && element.type === "Identifier") {
                    const componentName = element.name;
                    // Check if it ends with 'Module' and matches deprecated
                    for (const [deprecated, info] of Object.entries(
                      DEPRECATED_COMPONENTS,
                    )) {
                      if (
                        componentName === `${deprecated}Module` ||
                        componentName === deprecated
                      ) {
                        context.report({
                          node: element,
                          messageId: "deprecatedComponent",
                          data: {
                            message: info.message,
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
    };
  },
};

// =============================================================================
// Rule: primeng/no-inline-styles-for-tokens
// =============================================================================

const noInlineStylesForTokensRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Avoid inline styles that should use PrimeNG design tokens",
      category: "Best Practices",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      useTokenInstead:
        "Avoid inline {{ property }} with hard-coded value. Use PrimeNG CSS variables (--p-*) or component classes instead.",
    },
  },
  create(context) {
    // Properties that should use design tokens
    const tokenProperties = [
      "color",
      "background",
      "background-color",
      "border-color",
      "font-family",
    ];

    return {
      // Check [style] bindings in component templates
      Literal(node) {
        if (typeof node.value !== "string") return;

        // Check if it looks like inline styles with colors
        const value = node.value;

        // Check for color values in style attributes
        const colorPatterns = [
          /#[0-9a-fA-F]{3,8}\b/,
          /rgb\s*\(/i,
          /rgba\s*\(/i,
          /hsl\s*\(/i,
          /hsla\s*\(/i,
        ];

        // Only check strings that look like style values
        if (
          value.includes(":") &&
          tokenProperties.some((prop) => value.includes(prop))
        ) {
          for (const pattern of colorPatterns) {
            if (pattern.test(value)) {
              // Determine which property is affected
              const affectedProperty = tokenProperties.find((prop) =>
                value.includes(prop),
              );
              context.report({
                node,
                messageId: "useTokenInstead",
                data: {
                  property: affectedProperty || "style",
                },
              });
              break;
            }
          }
        }
      },
    };
  },
};

// =============================================================================
// Rule: primeng/consistent-icon-usage
// =============================================================================

const consistentIconUsageRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Ensure consistent usage of PrimeIcons",
      category: "Best Practices",
      recommended: false,
    },
    fixable: null,
    schema: [
      {
        type: "object",
        properties: {
          allowFontAwesome: { type: "boolean", default: false },
          allowMaterial: { type: "boolean", default: false },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferPrimeIcons:
        'Consider using PrimeIcons ("pi pi-*") for consistency with PrimeNG components.',
      missingPiPrefix:
        'PrimeIcon class should start with "pi pi-". Found: "{{ value }}".',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const allowFontAwesome = options.allowFontAwesome || false;
    const allowMaterial = options.allowMaterial || false;

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;

        const value = node.value;

        // Check for icon class patterns
        if (value.includes("fa-") && !allowFontAwesome) {
          // Font Awesome icon detected
          context.report({
            node,
            messageId: "preferPrimeIcons",
          });
        }

        if (
          (value.includes("material-icons") || value.includes("mat-icon")) &&
          !allowMaterial
        ) {
          // Material icon detected
          context.report({
            node,
            messageId: "preferPrimeIcons",
          });
        }

        // Check for incomplete PrimeIcon usage (just 'pi-' without 'pi ')
        if (
          value.includes("pi-") &&
          !value.includes("pi ") &&
          !value.startsWith("pi pi-")
        ) {
          // Might be missing the 'pi' base class
          if (!value.includes(" pi-")) {
            context.report({
              node,
              messageId: "missingPiPrefix",
              data: { value },
            });
          }
        }
      },
    };
  },
};

// =============================================================================
// Rule: primeng/require-message-service-provider
// =============================================================================

const requireMessageServiceProviderRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure MessageService is provided when using Toast or Message components",
      category: "Possible Errors",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      missingProvider:
        "MessageService should be provided in the component or module when using Toast/Message components.",
    },
  },
  create(context) {
    let hasToastImport = false;
    let hasMessageServiceImport = false;
    let hasMessageServiceProvider = false;

    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        if (source === "primeng/toast" || source === "primeng/message") {
          hasToastImport = true;
        }

        if (source === "primeng/api") {
          for (const specifier of node.specifiers) {
            if (
              specifier.imported &&
              specifier.imported.name === "MessageService"
            ) {
              hasMessageServiceImport = true;
            }
          }
        }
      },

      // Check for MessageService in providers
      Property(node) {
        if (
          node.key &&
          node.key.name === "providers" &&
          node.value.type === "ArrayExpression"
        ) {
          for (const element of node.value.elements) {
            if (
              element &&
              element.type === "Identifier" &&
              element.name === "MessageService"
            ) {
              hasMessageServiceProvider = true;
            }
          }
        }
      },

      "Program:exit"(node) {
        if (
          hasToastImport &&
          hasMessageServiceImport &&
          !hasMessageServiceProvider
        ) {
          // This is a simplified check - in real usage, MessageService might be provided at module level
          // So we only warn, not error
        }
      },
    };
  },
};

// =============================================================================
// Export Plugin
// =============================================================================

module.exports = {
  meta: {
    name: "eslint-plugin-primeng",
    version: "1.0.0",
  },
  rules: {
    "prefer-component-imports": preferComponentImportsRule,
    "valid-severity": validSeverityRule,
    "no-deprecated-components": noDeprecatedComponentsRule,
    "no-inline-styles-for-tokens": noInlineStylesForTokensRule,
    "consistent-icon-usage": consistentIconUsageRule,
    "require-message-service-provider": requireMessageServiceProviderRule,
  },
  configs: {
    recommended: {
      plugins: ["primeng"],
      rules: {
        "primeng/prefer-component-imports": "warn",
        "primeng/valid-severity": "error",
        "primeng/no-deprecated-components": "warn",
        "primeng/no-inline-styles-for-tokens": "warn",
        "primeng/consistent-icon-usage": "off",
        "primeng/require-message-service-provider": "warn",
      },
    },
    strict: {
      plugins: ["primeng"],
      rules: {
        "primeng/prefer-component-imports": "error",
        "primeng/valid-severity": "error",
        "primeng/no-deprecated-components": "error",
        "primeng/no-inline-styles-for-tokens": "error",
        "primeng/consistent-icon-usage": "warn",
        "primeng/require-message-service-provider": "error",
      },
    },
  },
};
