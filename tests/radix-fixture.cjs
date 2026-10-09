// Real Radix components, bundled only for offline browser tests; never shipped in the extension.
const React=require('react'),{createRoot}=require('react-dom/client');
const Menu=require('@radix-ui/react-dropdown-menu'),Select=require('@radix-ui/react-select');
const e=React.createElement;
window.mountRadixFixture=(initialRows,view)=> {
  window.radixSim={menus:0,dropdowns:0,saves:0,links:0,emailSends:0,messageSends:0,actions:[]};
  function App() {
    const [rows,setRows]=React.useState(initialRows),[modal,setModal]=React.useState(null);
    const [mode,setMode]=React.useState(''),[email,setEmail]=React.useState(true),[message,setMessage]=React.useState(false),[link,setLink]=React.useState('');
    const open=(i,kind)=>{setModal({i,kind});setMode('');setEmail(true);setMessage(false);setLink('');radixSim.actions.push(kind);};
    function menu(i) {
      return e(Menu.Root,{onOpenChange:value=>{if(value)radixSim.menus++;}},
        e(Menu.Trigger,{'aria-label':'Assignment menu'},e('svg',{className:'tabler-icon-dots-vertical',width:16,height:16}), '⋮'),
        e(Menu.Portal,null,e(Menu.Content,{style:{background:'white',border:'1px solid gray',padding:10,zIndex:50}},
          ...['Ganti Mode','Pengaturan Email'].map(kind=>e(Menu.Item,{key:kind,onSelect:()=>open(i,kind),style:{padding:8}},kind)))));
    }
    function dataRow(row,i) {
      if(view==='table')return e('tr',{key:row['Kode Identitas']},e('td',null),
        ...Fasih.sourceColumns.map(column=>e('td',{key:column,style:{padding:8}},row[column])),e('td',null,menu(i)));
      return e('div',{key:row['Kode Identitas'],className:'f:overflow-hidden f:rounded-lg f:border f:bg-card',style:{border:'1px solid gray',padding:12,margin:12}},
        e('div',{style:{display:'flex',justifyContent:'space-between'}},
          e('button',{className:'f:underline f:truncate'},row['Kode Identitas']),
          e('div',null,e('div',{className:'f:capitalize'},row.Status),menu(i))),
        e('div',{className:'f:grid f:grid-cols-2',style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr'}},
          ...Fasih.sourceColumns.filter(c=>!['Kode Identitas','Status','Mode','Petugas Saat Ini','Keterangan'].includes(c)).map(c=>
            e('div',{key:c},e('div',null,c),e('div',null,row[c])))),e('div',{className:'f:border'},row.Mode));
    }
    let popup=null;
    if(modal) {
      const close=e('button',{'aria-label':'Close',onClick:()=>setModal(null)},'Close');
      let controls;
      if(modal.kind==='Ganti Mode') {
        const options=['CAWI','CAPI','PAPI'].map(value=>e(Select.Item,{key:value,value,style:{padding:10}},e(Select.ItemText,null,value)));
        const selectContent=e(Select.Content,{style:{background:'white',border:'1px solid gray',zIndex:100}},e(Select.Viewport,null,...options));
        controls=[e(Select.Root,{key:'mode',value:mode,onValueChange:setMode,onOpenChange:value=>{if(value)radixSim.dropdowns++;}},
          e(Select.Trigger,{'aria-label':'Mode Pendataan'},e(Select.Value,{placeholder:'Pilih mode yang tersedia'})),e(Select.Portal,null,selectContent)),
          ...(mode==='CAWI'?[
            e('div',{key:'email'},e('label',{htmlFor:'real-email'},'Kirim Email'),e('button',{id:'real-email',role:'switch','aria-checked':email,onClick:()=>setEmail(!email)},'Email')),
            e('div',{key:'message'},e('label',{htmlFor:'real-message'},'Kirim Pesan'),e('button',{id:'real-message',role:'switch','aria-checked':message,onClick:()=>setMessage(!message)},'Pesan')),
            e('button',{key:'save',onClick:()=>{
              if(email)radixSim.emailSends++;if(message)radixSim.messageSends++;radixSim.saves++;
              setRows(rows.map((r,i)=>i===modal.i?{...r,Mode:'CAWI'}:r));setModal(null);
            }},'Ubah Mode Pendataan')]:[])];
      } else {
        controls=e('div',null,e('div',null,'Unique Link untuk assignment CAWI'),link?e('input',{value:link,readOnly:true}):
          e('button',{onClick:()=>{radixSim.links++;setLink('https://esurvey.bps.go.id/h/s/test-'+rows[modal.i]['Kode Identitas'].split('-').at(-1).trim());}},'Dapatkan Unique Link'));
      }
      popup=e('section',{role:'dialog',style:{position:'fixed',top:220,left:400,width:550,padding:30,background:'white',border:'2px solid gray',zIndex:80}},
        e('h2',null,modal.kind),controls,close);
    }
    return e(React.Fragment,null,
      view==='table'?e('table',{style:{font:'11px system-ui',width:'100%',borderCollapse:'collapse'}},
        e('thead',null,e('tr',null,e('th',null),...Fasih.sourceColumns.map(c=>e('th',{key:c},c)),e('th',null))),e('tbody',null,...rows.map(dataRow))):rows.map(dataRow),
      e('button',{'aria-label':'Go to next page',disabled:true},'Next'),popup);
  }
  const container=document.createElement('main');document.body.append(container);createRoot(container).render(e(App));
};
