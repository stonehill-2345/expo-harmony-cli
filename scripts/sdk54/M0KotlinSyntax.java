import com.intellij.openapi.Disposable;
import com.intellij.openapi.util.Disposer;
import com.intellij.psi.PsiElement;
import com.intellij.psi.PsiErrorElement;
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles;
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment;
import org.jetbrains.kotlin.config.CompilerConfiguration;
import org.jetbrains.kotlin.psi.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class M0KotlinSyntax {
  static final List<Map<String, Object>> records = new ArrayList<>();
  static final List<Map<String, Object>> diagnostics = new ArrayList<>();
  static int nodeCount;
  static Map<String, Object> row(Object... values) {
    Map<String, Object> output = new TreeMap<>();
    for (int index = 0; index < values.length; index += 2) output.put((String) values[index], values[index + 1]);
    return output;
  }
  static Map<String, Object> scope(PsiElement node, boolean parameter) {
    for (PsiElement parent = node.getParent(); parent != null; parent = parent.getParent()) {
      if (parameter ? parent instanceof KtNamedFunction || parent instanceof KtFunctionLiteral || parent instanceof KtClass : parent instanceof KtBlockExpression || parent instanceof KtClassBody || parent instanceof KtFile) {
        return row("start", parent.getTextRange().getStartOffset(), "end", parent.getTextRange().getEndOffset());
      }
    }
    return row("start", 0, "end", Integer.MAX_VALUE);
  }
  static void walk(PsiElement node) {
    nodeCount++;
    if (node instanceof PsiErrorElement error) diagnostics.add(row("offset", node.getTextRange().getStartOffset(), "message", error.getErrorDescription(), "severity", "error"));
    if (node instanceof KtDeclaration || node instanceof KtExpression || node instanceof KtImportDirective) {
      String kind = node.getClass().getSimpleName();
      Map<String, Object> value = row("syntaxKind", kind, "start", node.getTextRange().getStartOffset(), "end", node.getTextRange().getEndOffset(), "expression", node.getText(), "scope", scope(node, node instanceof KtParameter), "declaration", node instanceof KtDeclaration);
      if (node instanceof KtNamedDeclaration declaration) value.put("name", declaration.getName());
      if (node instanceof KtClassOrObject declaration) value.put("superTypes", declaration.getSuperTypeListEntries().stream().map(PsiElement::getText).toList());
      if (node instanceof KtCallExpression call && call.getCalleeExpression() != null) {
        value.put("callee", call.getCalleeExpression().getText());
        value.put("arguments", call.getValueArguments().stream().map(argument -> argument.getArgumentExpression() == null ? "" : argument.getArgumentExpression().getText()).toList());
      }
      if (node instanceof KtProperty property) {
        value.put("bindingKind", property.isVar() ? "var" : "let");
        value.put("bindings", List.of(row("name", property.getName(), "initializer", property.getInitializer() == null ? null : property.getInitializer().getText())));
      }
      if (node instanceof KtParameter parameter) value.put("parameterName", parameter.getName());
      if (node instanceof KtStringTemplateExpression literal) value.put("interpolated", Arrays.stream(literal.getEntries()).anyMatch(entry -> entry instanceof KtStringTemplateEntryWithExpression));
      records.add(value);
    }
    for (PsiElement child : node.getChildren()) walk(child);
  }
  static String json(Object value) {
    if (value == null) return "null";
    if (value instanceof Number || value instanceof Boolean) return value.toString();
    if (value instanceof Map<?, ?> map) return "{" + String.join(",", map.entrySet().stream().map(entry -> json(entry.getKey()) + ":" + json(entry.getValue())).toList()) + "}";
    if (value instanceof Collection<?> collection) return "[" + String.join(",", collection.stream().map(M0KotlinSyntax::json).toList()) + "]";
    StringBuilder output = new StringBuilder("\"");
    for (char item : value.toString().toCharArray()) {
      if (item == '"' || item == '\\') output.append('\\').append(item);
      else if (item < 32) output.append(String.format("\\u%04x", (int) item));
      else output.append(item);
    }
    return output.append('"').toString();
  }
  public static void main(String[] arguments) throws Exception {
    String source = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
    Disposable disposable = Disposer.newDisposable();
    try {
      KotlinCoreEnvironment environment = KotlinCoreEnvironment.createForProduction(disposable, new CompilerConfiguration(), EnvironmentConfigFiles.JVM_CONFIG_FILES);
      KtFile file = new KtPsiFactory(environment.getProject(), false).createFile(arguments.length > 0 ? arguments[0] : "Source.kt", source);
      walk(file);
      System.out.print(json(row("parser", "KotlinCompiler/PSI", "nodeCount", nodeCount, "diagnostics", diagnostics, "records", records)));
    } finally { Disposer.dispose(disposable); }
  }
}
