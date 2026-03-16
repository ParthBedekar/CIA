package org.app.cia.parser.JavaParser;

import com.github.javaparser.ParserConfiguration;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.Enums.Language;


import java.io.FileNotFoundException;
import java.nio.file.Path;
import java.util.List;

import static org.app.cia.parser.CodeUnit.*;


public class JavaASTParser extends VoidVisitorAdapter<Void>{

    private CodeUnit cdu;

    public CodeUnit parse(Path filePath){
        String filename=filePath.getFileName().toString();
        cdu=new CodeUnit(filename, Language.JAVA,filePath);
        CompilationUnit cu;
        try {
            StaticJavaParser.getParserConfiguration().setLanguageLevel(ParserConfiguration.LanguageLevel.JAVA_21);
            cu=StaticJavaParser.parse(filePath.toFile());
        } catch (FileNotFoundException e) {
            throw new RuntimeException("File Not Found");
        }
        cu.accept(this,null);
        return cdu;
    }
    @Override
     public void visit(MethodDeclaration md,Void arg){
        super.visit(md,arg);
        cdu.addMethod(md.getNameAsString());
    }
    @Override
    public void visit(ImportDeclaration id, Void arg){
        super.visit(id,arg);
        cdu.addImport(id.getNameAsString());
    }
    @Override
    public void visit(MethodCallExpr mce, Void arg){
        super.visit(mce,arg);
        cdu.addMethodCall(mce.getNameAsString());
    }
    @Override
    public void visit(ClassOrInterfaceDeclaration cd,Void arg){
        super.visit(cd,arg);
        if(cd.isInterface()){
            cdu.addInterface(cd.getNameAsString());
        }else{
            cdu.addClass(cd.getNameAsString());
            ParentData parentData=new ParentData(cd.getNameAsString());

            List<ClassOrInterfaceType> implementations=cd.getImplementedTypes();

            for(ClassOrInterfaceType e:implementations){
                parentData.addImplementation(e.asString());
            }
            cd.getExtendedTypes().getFirst().ifPresent(t -> parentData.setExtension(t.asString()));
            cdu.configureInheritance(parentData);

        }

    }

}
