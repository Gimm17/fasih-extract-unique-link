import sys, zipfile, xml.etree.ElementTree as ET

p = sys.argv[1]
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(p) as z:
    assert z.testzip() is None, 'ZIP CRC mismatch'
    for name in z.namelist():
        if name.endswith(('.xml', '.rels')):
            ET.fromstring(z.read(name))
    workbook = ET.fromstring(z.read('xl/workbook.xml'))
    assert [s.attrib['name'] for s in workbook.find('s:sheets', ns)] == ['DATA', 'ERROR', 'RINGKASAN']
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    cells = {c.attrib['r']: c for c in sheet.findall('.//s:c', ns)}
    def value(ref):
        return ''.join(cells[ref].itertext())
    assert value('A2') == '7271000000000000 - EC - 1 - 354'
    assert value('E2') == '0012345678901234'
    assert cells['E2'].attrib['t'] == 'inlineStr'
    assert value('B2').startswith('=HYPERLINK(')
    assert not sheet.findall('.//s:f', ns), 'Source text became an Excel formula'
    assert sheet.find('.//s:pane', ns).attrib['state'] == 'frozen'
    assert sheet.find('s:autoFilter', ns) is not None
    hyperlink = sheet.find('.//s:hyperlink', ns)
    assert value(hyperlink.attrib['ref']) == 'https://esurvey.bps.go.id/h/s/token?x=1&y=2'
    rels = ET.fromstring(z.read('xl/worksheets/_rels/sheet1.xml.rels'))
    assert list(rels)[0].attrib['Target'] == 'https://esurvey.bps.go.id/h/s/token?x=1&y=2'
try:
    import openpyxl
except ImportError:
    print('OOXML XML/ZIP read-back OK (openpyxl not installed)')
else:
    book = openpyxl.load_workbook(p)
    assert book['DATA']['E2'].value == '0012345678901234'
    assert book['DATA']['B2'].data_type == 's'
    assert book['DATA']['R2'].hyperlink.target == 'https://esurvey.bps.go.id/h/s/token?x=1&y=2'
print('Workbook read-back OK')
