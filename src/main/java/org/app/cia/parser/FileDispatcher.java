package org.app.cia.parser;

import org.app.cia.parser.Enums.Language;
import org.app.cia.parser.JSParser.JsASTParser;
import org.app.cia.parser.JavaParser.JavaASTParser;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class FileDispatcher {



    public List<CodeUnit> dispatch(Map<Language, List<Path>> fileMap){
        List<Path> javaList = fileMap.getOrDefault(Language.JAVA,new ArrayList<>());
        List<Path> jsList=fileMap.getOrDefault(Language.JS,new ArrayList<>());
        List<CodeUnit> result=new ArrayList<>();
        for(Path p:javaList){
            JavaASTParser javaASTParser=new JavaASTParser();
            result.add(javaASTParser.parse(p));
        }
        for(Path p:jsList){
            JsASTParser jsASTParser=new JsASTParser();
            result.add(jsASTParser.parse(p));
        }
        return result;
    }
}
