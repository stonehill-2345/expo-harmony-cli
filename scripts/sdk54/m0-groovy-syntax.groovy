import groovy.json.JsonOutput
import org.codehaus.groovy.ast.ASTNode
import org.codehaus.groovy.ast.ModuleNode
import org.codehaus.groovy.ast.expr.MethodCallExpression
import org.codehaus.groovy.ast.expr.StaticMethodCallExpression
import org.codehaus.groovy.control.SourceUnit

def source = System.in.getText('UTF-8')
def unit = SourceUnit.create('Source.gradle', source)
def records = []
def diagnostics = []
def sourceLines = source.split('\n', -1)
def expression = { ASTNode node ->
  if (node.lineNumber < 1 || node.lastLineNumber < node.lineNumber) return node.text
  def rows = sourceLines[(node.lineNumber - 1)..Math.min(node.lastLineNumber - 1, sourceLines.length - 1)].toList()
  if (rows.size() == 1) return rows[0].substring(Math.max(0, node.columnNumber - 1), Math.min(rows[0].length(), Math.max(node.columnNumber - 1, node.lastColumnNumber - 1)))
  rows[rows.size() - 1] = rows.last().take(Math.max(0, node.lastColumnNumber - 1))
  rows[0] = rows[0].drop(Math.max(0, node.columnNumber - 1))
  rows.join('\n')
}
def seen = Collections.newSetFromMap(new IdentityHashMap())
def ignored = ['type', 'originType', 'declaringClass', 'outerClass', 'owner', 'accessedVariable', 'module', 'compileUnit', 'superClass', 'interfaces', 'redirect', 'genericsTypes', 'metaDataMap'] as Set
def walk
walk = { ASTNode node ->
  if (!seen.add(node)) return
  if (node.lineNumber > 0) {
    def record = [syntaxKind: node.class.simpleName, line: node.lineNumber, endLine: Math.max(node.lineNumber, node.lastLineNumber), expression: expression(node)]
    if (node.metaClass.hasProperty(node, 'name')) record.name = node.name?.toString()
    if (node instanceof MethodCallExpression || node instanceof StaticMethodCallExpression) {
      record.callee = node instanceof MethodCallExpression ? node.methodAsString ?: node.method.text : node.method
      record.arguments = node.arguments.metaClass.hasProperty(node.arguments, 'expressions') ? node.arguments.expressions.collect { expression(it) } : [expression(node.arguments)]
    }
    records.add(record)
  } else if (!(node instanceof ModuleNode) && node.class.simpleName != 'ClassNode' && node.class.simpleName != 'BlockStatement') return
  // Traverse library AST relationships only. SourceUnit stops at conversion:
  // Gradle plugins, dependency resolution and user source are never executed.
  for (def type = node.class; type != null && ASTNode.isAssignableFrom(type); type = type.superclass) {
    type.declaredFields.findAll { !java.lang.reflect.Modifier.isStatic(it.modifiers) && !ignored.contains(it.name) && (ASTNode.isAssignableFrom(it.type) || Collection.isAssignableFrom(it.type) || Map.isAssignableFrom(it.type) || it.type.isArray()) }.sort { it.name }.each { field ->
      field.setAccessible(true)
      def child = field.get(node)
      if (child instanceof ASTNode) walk(child)
      else if (child instanceof Collection) child.findAll { it instanceof ASTNode }.each { walk(it) }
      else if (child instanceof Map) child.values().findAll { it instanceof ASTNode }.each { walk(it) }
      else if (child?.class?.isArray()) child.findAll { it instanceof ASTNode }.each { walk(it) }
    }
  }
}
try {
  unit.parse()
  unit.completePhase()
  unit.nextPhase()
  unit.convert()
  walk(unit.AST)
} catch (Exception failure) {
  diagnostics.add([line: 1, endLine: sourceLines.length, severity: 'error', message: failure.message])
}
print JsonOutput.toJson([parser: 'GroovyCompiler/AST', nodeCount: seen.size(), diagnostics: diagnostics, records: records])
