import Foundation
import SwiftSyntax
import SwiftParser
import SwiftParserDiagnostics

let data = FileHandle.standardInput.readDataToEndOfFile()
let source = String(decoding: data, as: UTF8.self)
let tree = Parser.parse(source: source)
var records: [[String: Any]] = []
var nodeCount = 0

func scope(_ node: Syntax, parameter: Bool = false) -> [String: Int] {
  var parent = node.parent
  while let current = parent {
    let kind = String(describing: current.kind)
    if (parameter && ["functionDecl", "initializerDecl", "closureExpr"].contains(kind)) || (!parameter && ["codeBlock", "memberBlock", "closureExpr", "sourceFile"].contains(kind)) {
      return ["start": current.positionAfterSkippingLeadingTrivia.utf8Offset, "end": current.endPositionBeforeTrailingTrivia.utf8Offset]
    }
    parent = current.parent
  }
  return ["start": 0, "end": data.count]
}

func walk(_ node: Syntax) {
  nodeCount += 1
  let kind = String(describing: node.kind)
  let relevant = kind.hasSuffix("Decl") || kind.hasSuffix("Expr") || kind.hasSuffix("Stmt") || ["patternBinding", "attribute", "ifConfigClause", "availabilityCondition", "functionParameter", "closureParameter", "closureShorthandParameter"].contains(kind)
  if relevant {
    var row: [String: Any] = [
      "syntaxKind": kind,
      "start": node.positionAfterSkippingLeadingTrivia.utf8Offset,
      "end": node.endPositionBeforeTrailingTrivia.utf8Offset,
      "expression": node.trimmedDescription,
      "scope": scope(node),
    ]
    if let call = node.as(FunctionCallExprSyntax.self) {
      row["callee"] = call.calledExpression.trimmedDescription
      row["arguments"] = call.arguments.map { $0.expression.trimmedDescription }
    }
    if let function = node.as(FunctionDeclSyntax.self) { row["name"] = function.name.text }
    if let declaration = node.as(ClassDeclSyntax.self) { row["name"] = declaration.name.text }
    if let declaration = node.as(StructDeclSyntax.self) { row["name"] = declaration.name.text }
    if let declaration = node.as(EnumDeclSyntax.self) { row["name"] = declaration.name.text }
    if let declaration = node.as(ProtocolDeclSyntax.self) { row["name"] = declaration.name.text }
    if let declaration = node.as(TypeAliasDeclSyntax.self) { row["name"] = declaration.name.text }
    if let declaration = node.as(VariableDeclSyntax.self) {
      row["bindingKind"] = declaration.bindingSpecifier.text
      row["bindings"] = declaration.bindings.map { binding -> [String: Any] in
        var item: [String: Any] = ["name": binding.pattern.trimmedDescription]
        if let initializer = binding.initializer { item["initializer"] = initializer.value.trimmedDescription }
        return item
      }
    }
    if let parameter = node.as(FunctionParameterSyntax.self) {
      row["parameterName"] = parameter.secondName?.text ?? parameter.firstName.text
      row["scope"] = scope(node, parameter: true)
    }
    if let parameter = node.as(ClosureParameterSyntax.self) {
      row["parameterName"] = parameter.secondName?.text ?? parameter.firstName.text
      row["scope"] = scope(node, parameter: true)
    }
    if let parameter = node.as(ClosureShorthandParameterSyntax.self) {
      row["parameterName"] = parameter.name.text
      row["scope"] = scope(node, parameter: true)
    }
    if let array = node.as(ArrayExprSyntax.self) { row["elements"] = array.elements.map { $0.expression.trimmedDescription } }
    if let literal = node.as(StringLiteralExprSyntax.self) {
      row["interpolated"] = literal.segments.contains { $0.is(ExpressionSegmentSyntax.self) }
    }
    records.append(row)
  }
  for child in node.children(viewMode: .sourceAccurate) { walk(child) }
}

walk(Syntax(tree))
let diagnostics = ParseDiagnosticsGenerator.diagnostics(for: tree).map { diagnostic -> [String: Any] in
  ["offset": diagnostic.position.utf8Offset, "message": diagnostic.message, "severity": String(describing: diagnostic.diagMessage.severity)]
}
let output: [String: Any] = ["parser": "SwiftParser/SwiftSyntax", "nodeCount": nodeCount, "diagnostics": diagnostics, "records": records]
let encoded = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
FileHandle.standardOutput.write(encoded)
