import re

file_path = r"c:\Coding\MeeraAI---The-Ultimate-Personal-AI-Assistant\desktop_frontend\src\App.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

smart_parser_code = """
    try {
      let fullText = "";
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
           const page = await pdf.getPage(i);
           const content = await page.getTextContent();
           fullText += content.items.map((item: any) => item.str).join(" ") + "\\n";
        }
      } else {
        fullText = await file.text();
      }

      // Smart Parsing Heuristic
      const lines = fullText.split("\\n").map((l: string) => l.trim()).filter(Boolean);
      let nameGuess = "";
      let roleGuess = "";
      
      if (lines.length > 0) {
         let clean = lines[0].replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}/g, '');
         clean = clean.replace(/\\+?\\d[\\d\\s-]{8,}\\d/g, '');
         
         const splitByDelim = clean.split(/\\||-|–|•/);
         if (splitByDelim.length > 1) {
             nameGuess = splitByDelim[0].trim();
             roleGuess = splitByDelim[1].trim();
         } else {
             const roleKeywords = ["Engineer", "Developer", "Designer", "Manager", "Student", "Director", "Consultant", "Specialist", "Analyst", "Lead", "Architect", "Scientist", "Officer", "Founder", "CEO", "CTO"];
             let foundKeyword = false;
             for (const kw of roleKeywords) {
                 const idx = clean.toLowerCase().indexOf(kw.toLowerCase());
                 if (idx > 0) {
                     const endOfName = clean.substring(0, idx).trim().lastIndexOf(" ");
                     if (endOfName > 0) {
                         nameGuess = clean.substring(0, endOfName).trim();
                         roleGuess = clean.substring(endOfName).trim();
                         foundKeyword = true;
                         break;
                     }
                 }
             }
             if (!foundKeyword) {
                 const words = clean.split(/\\s+/);
                 nameGuess = words.slice(0, 3).join(" ");
             }
         }
         nameGuess = nameGuess.replace(/^(Mr\\.|Mrs\\.|Ms\\.|Dr\\.)\\s+/i, '');
      }
      
      if (nameGuess) {
         setLocalNameInput(nameGuess);
         setLocalPreferredNameInput(nameGuess.split(" ")[0]);
      }
      if (roleGuess) {
         setLocalRoleInput(roleGuess);
      }
      
      setLocalBioInput(prev => (prev ? prev + "\\n\\n" : "") + "Resume Context:\\n" + fullText.slice(0, 1500));
    } catch (err) {
      console.error(err);
    }
"""

pattern = re.compile(r'    try \{.*?    \} catch \(err\) \{\s*console\.error\(err\);\s*\}', re.DOTALL)
code = pattern.sub(lambda m: smart_parser_code.strip(), code, count=1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Updated resume parser.")
