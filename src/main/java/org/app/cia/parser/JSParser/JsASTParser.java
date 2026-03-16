package org.app.cia.parser.JSParser;

import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.Enums.Language;
import org.jspecify.annotations.NonNull;
import com.fasterxml.jackson.core.JacksonException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.nio.file.Paths;

public class JsASTParser {

    private static final String PARSER_PATH = "D:\\Data\\SY\\CIA\\src\\main\\java\\org\\app\\cia\\processing\\JSParser\\parser.js";

    public CodeUnit parse(Path filePath){
        JsonNode node=fetchAndParseJSON(filePath);
        return convert(node);
    }

    public JsonNode fetchAndParseJSON(Path filePath){
        ProcessBuilder pb=new ProcessBuilder("node",PARSER_PATH,filePath.toString());
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process fetchProcess;
        try {
           fetchProcess=pb.start();
        } catch (IOException e) {
            throw new RuntimeException("Unable to run js parser");
        }
        String json = getString(fetchProcess);
        ObjectMapper mapper=new ObjectMapper();
        int exitCode;
        try {
            exitCode=fetchProcess.waitFor();
        } catch (InterruptedException e) {
            throw new RuntimeException("Fatal Error JS Parsing Failed");
        }
        if(exitCode!=0){
            throw new RuntimeException("Fatal Error JS Parsing Failed");
        }
        JsonNode node;
        try{
            node=mapper.readTree(json);

        } catch (JacksonException e) {
            throw new RuntimeException("JSON Mapper Failed");
        }
        return node;
    }

    private static @NonNull String getString(Process fetchProcess) {
        BufferedReader reader=new BufferedReader(new InputStreamReader(fetchProcess.getInputStream()));
        StringBuilder jsonBuilder=new StringBuilder();
        String line;

        while(true) {

            try {
                line=reader.readLine();
                if(line==null){
                    break;
                }
                jsonBuilder.append(line);

            } catch (IOException e) {
                throw new RuntimeException("Unable to Parse JSON");
            }
        }
        return jsonBuilder.toString();
    }

    public CodeUnit convert(JsonNode node){
        String filename=node.get("filename").asText();
        CodeUnit cu=new CodeUnit(filename, Language.JS, Paths.get(node.get("filepath").asText()));

        for(JsonNode item: node.get("imports")){
            cu.addImport(item.asText());
        }
        for(JsonNode item: node.get("methods")){
            cu.addMethod(item.asText());
        }
        for(JsonNode item: node.get("methodCalls")){
            cu.addMethodCall(item.asText());
        }
        for(JsonNode item: node.get("classes")){
            cu.addClass(item.asText());
        }
        for(JsonNode item : node.get("inheritance")) {
            String className = item.get("className").asText();
            String ext = item.get("extends").asText();
            CodeUnit.ParentData data=new CodeUnit.ParentData(className);
            data.setExtension(ext);
            cu.configureInheritance(data);

        }
        return cu;
    }
}
