import type { Node } from "@vscode/tree-sitter-wasm";
import type { Declaration, DeclarationKind } from "../model.ts";

/**
 * Where a file declares its names, for the viewer's "defined at": the module's top-level
 * declarations (exported or not) and its classes' members. By name only, the same as a
 * text search would find them: no scopes, no types, no imports followed. A function's
 * locals are left out, so a common name like `result` doesn't list every function.
 */
export function declarationsOf(root: Node): Declaration[] {
  const found: Declaration[] = [];
  const add = (nameNode: Node | null, kind: DeclarationKind) => {
    if (nameNode && /^[A-Za-z_$][\w$]*$/.test(nameNode.text)) {
      found.push({ name: nameNode.text, line: nameNode.startPosition.row + 1, kind });
    }
  };
  for (const statement of root.namedChildren) {
    if (statement) topLevel(statement, add);
  }
  return found;
}

type Add = (nameNode: Node | null, kind: DeclarationKind) => void;

function topLevel(statement: Node, add: Add): void {
  let node = statement;
  if (node.type === "export_statement") node = node.childForFieldName("declaration") ?? node;
  if (node.type === "ambient_declaration") node = node.namedChildren.find((child) => child !== null) ?? node;
  // `namespace X {}` parses as an expression statement around the module
  if (node.type === "expression_statement" && node.namedChildren[0]?.type === "internal_module") {
    node = node.namedChildren[0];
  }
  switch (node.type) {
    case "function_declaration":
    case "generator_function_declaration":
    case "function_signature":
      add(node.childForFieldName("name"), "function");
      return;
    case "class_declaration":
    case "abstract_class_declaration": {
      add(node.childForFieldName("name"), "class");
      for (const member of node.childForFieldName("body")?.namedChildren ?? []) {
        if (!member) continue;
        if (member.type === "method_definition" || member.type === "abstract_method_signature" || member.type === "method_signature") {
          add(member.childForFieldName("name"), "method");
        } else if (member.type === "public_field_definition" || member.type === "field_definition") {
          add(member.childForFieldName("name") ?? member.childForFieldName("property"), "property");
        }
      }
      return;
    }
    case "lexical_declaration":
    case "variable_declaration":
      for (const declarator of node.namedChildren) {
        // a destructuring pattern names nothing to jump to by itself
        if (declarator?.type === "variable_declarator") add(declarator.childForFieldName("name"), "variable");
      }
      return;
    case "interface_declaration":
    case "type_alias_declaration":
      add(node.childForFieldName("name"), "type");
      return;
    case "enum_declaration":
      add(node.childForFieldName("name"), "enum");
      return;
    case "internal_module":
    case "module":
      add(node.childForFieldName("name"), "namespace");
      return;
  }
}
