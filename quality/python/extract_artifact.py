"""Read downloaded work-item exports as passive text. No macros or network calls."""
import sys, pathlib, zipfile, xml.etree.ElementTree as ET, subprocess, shutil
from html.parser import HTMLParser

class TextHTML(HTMLParser):
    def __init__(self): super().__init__(); self.out=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
        if tag in ('p','div','br','li','tr','h1','h2','h3'): self.out.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip: self.out.append(data)

def extract(file):
    p=pathlib.Path(file); ext=p.suffix.lower()
    if p.stat().st_size>10*1024*1024: raise ValueError('file_limit')
    if ext in ('.docx','.xlsx'):
        with zipfile.ZipFile(p) as archive:
            if sum(i.file_size for i in archive.infolist())>50*1024*1024: raise ValueError('expanded_limit')
            if ext=='.docx':
                raw=archive.read('word/document.xml')
                if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw: raise ValueError('unsupported_xml')
                root=ET.fromstring(raw); ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                return '\n'.join(''.join(t.text or '' for t in x.findall('.//w:t',ns)) for x in root.findall('.//w:p',ns))
        from openpyxl import load_workbook
        book=load_workbook(p,read_only=True,data_only=False,keep_links=False)
        try:
            rows=[]
            for sheet in book:
                rows.append('Sheet: '+sheet.title)
                if sheet.max_row and sheet.max_row>10000: raise ValueError('row_limit')
                for row in sheet:
                    if any(c.data_type=='f' for c in row): raise ValueError('use_literal_values')
                    rows.append('\t'.join(str(c.value or '') for c in row))
            return '\n'.join(rows)
        finally: book.close()
    if ext=='.xls':
        import xlrd
        book=xlrd.open_workbook(str(p),on_demand=True)
        try:
            if sum(s.nrows for s in book.sheets())>10000: raise ValueError('row_limit')
            return '\n'.join('\t'.join(map(str,s.row_values(i))) for s in book.sheets() for i in range(s.nrows))
        finally: book.release_resources()
    if ext in ('.html','.htm'):
        parser=TextHTML();parser.feed(p.read_text(encoding='utf-8-sig'));return ''.join(parser.out)
    if ext=='.pdf':
        from pypdf import PdfReader
        reader=PdfReader(p)
        if reader.is_encrypted or len(reader.pages)>100: raise ValueError('pdf_limit')
        pages=[(i,page.extract_text() or '') for i,page in enumerate(reader.pages)]
        if not any(text.strip() for _,text in pages): raise ValueError('pdf_needs_ocr')
        return '\n'.join(f'Page {i+1}\n'+text for i,text in pages if text.strip())
    if ext=='.doc':
        command=['/usr/bin/textutil','-convert','txt','-stdout',str(p)] if sys.platform=='darwin' else [shutil.which('antiword') or 'antiword',str(p)]
        return subprocess.run(command,check=True,capture_output=True,timeout=20).stdout.decode('utf-8')
    raise ValueError('unsupported_format')

if __name__=='__main__':
    try:
        text=extract(sys.argv[1])
        if len(text)>150000: raise ValueError('text_limit')
        print(text)
    except Exception:
        print('Artifact extraction failed. PDF needs pypdf and selectable text; Office needs importer dependencies.',file=sys.stderr);sys.exit(1)
