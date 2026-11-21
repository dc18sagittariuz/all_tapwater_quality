"""Reshape เคมีใหญ่.xlsx into rows for the dashboard. Numbers stay numbers;
'น้อยกว่า x' / '< x' -> '<x', 'มากกว่า x' -> '>x', 'ND' stays 'ND', '-' and blanks are dropped."""
import sys, json, re, openpyxl
SRC, OUT, CRIT = sys.argv[1], sys.argv[2], sys.argv[3]
# key, column index, name, group, unit, lo, hi   (limits: MWA criteria announced 11 Oct 2022)
P = [
 ("cl",11,"คลอรีนอิสระคงเหลือ","กายภาพ","mg/L",0.2,2.0),
 ("turb",12,"ความขุ่น","กายภาพ","NTU",None,1.0),
 ("ph",13,"ความเป็นกรด-ด่าง (pH)","กายภาพ","",6.5,8.5),
 ("ec",14,"การนำไฟฟ้า","กายภาพ","",None,None),
 ("tds",15,"สารละลาย (TDS)","กายภาพ","mg/L",None,1000),
 ("color",16,"สีปรากฏ","กายภาพ","Pt-Co",None,15),
 ("tcolor",92,"สีจริง","กายภาพ","",None,None),
 ("tturb",87,"ความขุ่นจริง","กายภาพ","",None,None),
 ("ecoli",None,"อี.โคไล","จุลชีววิทยา","พบ/ไม่พบ",None,None),
 ("coli",None,"โคลิฟอร์มแบคทีเรีย","จุลชีววิทยา","พบ/ไม่พบ",None,None),
 ("hpc",77,"จุลินทรีย์ทั้งหมด","จุลชีววิทยา","CFU/mL",None,500),
 ("alk",23,"ความเป็นด่างทั้งหมด","เคมีทั่วไป","",None,None),
 ("palk",24,"ความเป็นด่าง-ฟีนอล์ฟทาลีน","เคมีทั่วไป","",None,None),
 ("ts",25,"ปริมาณมวลสารทั้งหมด","เคมีทั่วไป","",None,None),
 ("hard",26,"ความกระด้างทั้งหมด","เคมีทั่วไป","mg/L",None,300),
 ("thard",27,"ความกระด้างชั่วคราว","เคมีทั่วไป","",None,None),
 ("phard",28,"ความกระด้างถาวร","เคมีทั่วไป","",None,None),
 ("chloride",29,"คลอไรด์","เคมีทั่วไป","mg/L",None,250),
 ("sulfate",30,"ซัลเฟต","เคมีทั่วไป","mg/L",None,250),
 ("fluoride",33,"ฟลูออไรด์","เคมีทั่วไป","mg/L",None,0.7),
 ("oc",73,"ออกซิเจนคอนซูม","เคมีทั่วไป","",None,None),
 ("nh3",74,"แอมโมเนียอิสระ-ไนโตรเจน","เคมีทั่วไป","mg/L",None,1.5),
 ("no3",75,"ไนเตรท","เคมีทั่วไป","mg/L",None,50),
 ("no2",76,"ไนไตรท์","เคมีทั่วไป","mg/L",None,3),
 ("ca",31,"แคลเซียม","โลหะและแร่ธาตุ","",None,None),
 ("mg",34,"แมกนีเซียม","โลหะและแร่ธาตุ","",None,None),
 ("si",35,"ซิลิคอน","โลหะและแร่ธาตุ","",None,None),
 ("na",36,"โซเดียม","โลหะและแร่ธาตุ","mg/L",None,200),
 ("k",37,"โพแทสเซียม","โลหะและแร่ธาตุ","",None,None),
 ("fe",32,"เหล็ก","โลหะและแร่ธาตุ","mg/L",None,0.3),
 ("mn",38,"แมงกานีส","โลหะและแร่ธาตุ","mg/L",None,0.08),
 ("pb",39,"ตะกั่ว","โลหะและแร่ธาตุ","mg/L",None,0.01),
 ("cr",40,"โครเมียม","โลหะและแร่ธาตุ","mg/L",None,0.05),
 ("cd",41,"แคดเมียม","โลหะและแร่ธาตุ","mg/L",None,0.003),
 ("hg",42,"ปรอท","โลหะและแร่ธาตุ","mg/L",None,0.006),
 ("ag",43,"เงิน","โลหะและแร่ธาตุ","mg/L",None,0.1),
 ("as",44,"สารหนู","โลหะและแร่ธาตุ","mg/L",None,0.01),
 ("mo",45,"โมลิบดีนัม","โลหะและแร่ธาตุ","",None,None),
 ("sb",46,"พลวง","โลหะและแร่ธาตุ","mg/L",None,0.02),
 ("se",47,"ซีลีเนียม","โลหะและแร่ธาตุ","mg/L",None,0.04),
 ("cu",48,"ทองแดง","โลหะและแร่ธาตุ","mg/L",None,1),
 ("zn",49,"สังกะสี","โลหะและแร่ธาตุ","mg/L",None,3),
 ("al",50,"อะลูมิเนียม","โลหะและแร่ธาตุ","mg/L",None,0.2),
 ("ba",51,"แบเรียม","โลหะและแร่ธาตุ","mg/L",None,1.3),
 ("ni",52,"นิกเกิล","โลหะและแร่ธาตุ","mg/L",None,0.07),
 ("thm",53,"สารไตรฮาโลมีเทน (ผลรวมอัตราส่วน)","สารอินทรีย์","",None,1),
 ("toc",54,"สารอินทรีย์คาร์บอนทั้งหมด","สารอินทรีย์","",None,None),
 ("benzene",55,"เบนซีน","สารอินทรีย์","µg/L",None,10),
 ("toluene",56,"โทลูอีน","สารอินทรีย์","µg/L",None,700),
 ("clbenz",57,"คลอโรเบนซีน","สารอินทรีย์","",None,None),
 ("xylene",58,"เมตา-ไซลีน","สารอินทรีย์","",None,None),
 ("styrene",59,"สไตรีน","สารอินทรีย์","µg/L",None,20),
 ("ipb",60,"ไอโซโพรพิลเบนซีน","สารอินทรีย์","",None,None),
 ("npb",61,"นอร์มาลโพรพิลเบนซีน","สารอินทรีย์","",None,None),
 ("tmb",62,"1,3,5-ไตรเมทิลเบนซีน","สารอินทรีย์","",None,None),
 ("tbb",63,"เทอร์เชียรีบิวทิลเบนซีน","สารอินทรีย์","",None,None),
 ("vc",64,"ไวนิลคลอไรด์","สารอินทรีย์","",None,None),
 ("tdce",65,"ทรานส์-1,2-ไดคลอโรอีทีน","สารอินทรีย์","",None,None),
 ("cdce",66,"ซิส-1,2-ไดคลอโรอีทีน","สารอินทรีย์","",None,None),
 ("tca",67,"1,1,1-ไตรคลอโรอีเทน","สารอินทรีย์","µg/L",None,2000),
 ("ccl4",68,"คาร์บอนเตตระคลอไรด์","สารอินทรีย์","µg/L",None,4),
 ("dca",69,"1,2-ไดคลอโรอีเทน","สารอินทรีย์","µg/L",None,30),
 ("tce",70,"ไตรคลอโรอีทีน","สารอินทรีย์","µg/L",None,8),
 ("pce",71,"เตตระคลอโรอีทีน","สารอินทรีย์","µg/L",None,100),
 ("ebenz",72,"เอทิลเบนซีน","สารอินทรีย์","µg/L",None,300),
]
def cell(v):
    if v is None: return None
    if isinstance(v,(int,float)): return round(float(v),6)
    s=str(v).strip()
    if s in("","-"): return None
    if s=="ND": return "ND"
    m=re.match(r"^(น้อยกว่า|<)\s*([\d.]+)$",s)
    if m: return "<"+str(float(m.group(2)))
    m=re.match(r"^มากกว่า\s*([\d.]+)$",s)
    if m: return ">"+str(float(m.group(1)))
    try: return float(s.rstrip("."))
    except ValueError: raise SystemExit("unparsed: "+repr(s))
def found(*vals):
    for v in vals:
        if v is None: continue
        s=str(v).strip()
        if s=="พบ": return "พบ"
        if s in("ไม่พบ","< 1"): return "ไม่พบ"
        raise SystemExit("unparsed: "+repr(s))
    return None
ws=openpyxl.load_workbook(SRC,data_only=True).worksheets[0]
rows=[]
for r in ws.iter_rows(min_row=2,values_only=True):
    if not r[0]: continue
    o={"id":r[0],"date":r[5].strftime("%Y-%m-%d"),"site":" ".join(str(r[3]).split()),
       "branch":" ".join(str(r[8]).split()),"job":str(r[9]).strip()}
    for k,c,*_ in P:
        v = found(r[20],r[22]) if k=="ecoli" else found(r[17],r[99],r[19]) if k=="coli" else cell(r[c])
        if v is not None: o[k]=v
    rows.append(o)
rows.sort(key=lambda o:(o["date"],o["id"]))
code=open(__file__,encoding="utf-8").read()
json.dump({"rows":rows,"meta":[{"label":"clean.py","value":code,"type":"code","lang":"python"},{"label":"Input","value":"เคมีใหญ่.xlsx (Google Drive)"}]},open(OUT,"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
crit=[{"key":k,"name":n,"group":g,"unit":u,"lo":lo,"hi":hi,"kind":"found" if k in("ecoli","coli") else "num","order":i} for i,(k,c,n,g,u,lo,hi) in enumerate(P)]
json.dump({"rows":crit,"meta":[{"label":"ที่มาของเกณฑ์","value":"เกณฑ์กำหนดคุณภาพน้ำประปา การประปานครหลวง ประกาศ ณ วันที่ 11 ตุลาคม 2565"}]},open(CRIT,"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(len(rows),len(crit))
