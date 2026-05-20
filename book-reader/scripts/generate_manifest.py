import re
import json
import os

def parse_readme(readme_path):
    with open(readme_path, 'r') as f:
        content = f.read()

    sections = []
    # Find sections like "### Section 1 - ..."
    section_matches = list(re.finditer(r'### (Section \d+ - [^\n]+)', content))
    
    # Also look for "## Table of Contents" to start, but the sections are more specific
    
    for i, match in enumerate(section_matches):
        section_title = match.group(1)
        start = match.end()
        end = section_matches[i+1].start() if i + 1 < len(section_matches) else len(content)
        section_content = content[start:end]
        
        chapters = []
        # Find table rows with links: | 0 | [Kickstart](./section_1/kickstart.md) | ... |
        # Regex for markdown links in tables
        rows = re.findall(r'\|\s*([\w.]+)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|', section_content)
        
        for ch_num, ch_title, ch_path in rows:
            # Clean up path - make it relative to the root of the book
            # In README.md they are like ./section_1/kickstart.md
            # We want them relative to the root for the reader to fetch
            clean_path = ch_path.lstrip('./')
            chapters.append({
                "id": ch_num,
                "title": ch_title,
                "path": clean_path
            })
        
        if chapters:
            sections.append({
                "title": section_title,
                "chapters": chapters
            })

    # Add Section 4 which was also in the README
    # And Projects
    project_section = re.search(r'## Projects\n\n(.*?)\n\n## About', content, re.DOTALL)
    if project_section:
        proj_content = project_section.group(1)
        proj_links = re.findall(r'\* .*?\[([^\]]+)\]\(([^)]+)\)', proj_content)
        proj_chapters = []
        for i, (title, path) in enumerate(proj_links):
            clean_path = path.lstrip('./')
            # If title is generic, use directory name
            if title.lower() in ['this', 'link', 'here']:
                dir_name = clean_path.split('/')[1] if '/' in clean_path else clean_path
                title = dir_name.replace('_', ' ').title()
            
            proj_chapters.append({
                "id": f"p{i}",
                "title": title,
                "path": clean_path
            })
        if proj_chapters:
            sections.append({
                "title": "Projects",
                "chapters": proj_chapters
            })

    return sections

if __name__ == "__main__":
    readme_path = "../README.md"
    if os.path.exists(readme_path):
        manifest = parse_readme(readme_path)
        with open("src/manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)
        print("Manifest generated successfully.")
    else:
        print("README.md not found.")
