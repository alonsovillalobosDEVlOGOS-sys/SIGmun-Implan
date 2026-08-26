/**
 * SIGmun Delicias - endpoint mínimo de lectura desde Google Sheets.
 * Cambia SHEET_NAME y despliega como "Aplicación web".
 * Para datos abiertos puede configurarse acceso público.
 */
const SHEET_NAME = 'Datos';

function doGet(e) {
  const sheetName = (e && e.parameter && e.parameter.sheet) || SHEET_NAME;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({error:'Hoja no encontrada'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  const headers = values.shift().map(function(h,i){ return h || ('campo_'+(i+1)); });
  const rows = values.filter(function(row){ return row.some(String); }).map(function(row){
    const obj={}; headers.forEach(function(key,i){ obj[key]=row[i] || ''; }); return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}
