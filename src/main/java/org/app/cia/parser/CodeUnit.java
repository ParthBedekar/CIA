package org.app.cia.parser;

import lombok.Getter;
import lombok.Setter;
import org.app.cia.parser.Enums.Language;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Getter
public class CodeUnit {
    private final List<String> interfaces;   //File Specific Model
    private final String filename;
    private final Path filePath;
    private final Language language;

    private final List<String> classes;
    private final List<String> methods;
    private final List<String> imports;
    private final List<String> methodCalls;
    private final List<ParentData> inheritance;

    @Getter
    public static class ParentData{
        private final String className;
        @Setter
        private String extension;
        private final List<String> implementations;


        public ParentData(String className){
            this.className=className;
            this.implementations=new ArrayList<>();
        }

        public void addImplementation(String imp){
            implementations.add(imp);
        }

    }

    public CodeUnit(String filename,Language language,Path filePath){
        this.filename=filename;
        this.language=language;
        classes=new ArrayList<>();
        interfaces=new ArrayList<>();
        methods=new ArrayList<>();
        imports=new ArrayList<>();
        methodCalls=new ArrayList<>();
        inheritance=new ArrayList<>();
        this.filePath=filePath;
    }

    public void addClass(String cl){
        classes.add(cl);
    }
    public void addInterface(String il){
         interfaces.add(il);
    }
    public void addMethod(String method){
        methods.add(method);
    }
    public void addMethodCall(String methodCall){
        methodCalls.add(methodCall);
    }
    public void addImport(String importe){
        imports.add(importe);
    }

    public void configureInheritance(ParentData data){
        inheritance.add(data);
    }

}
