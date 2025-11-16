// 内容脚本，在页面上下文中执行

// 监听来自后台脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractData') {
    // 提取页面数据
    const data = extractPageData();
    sendResponse({ success: true, data: data });
  }
  return true;
});

// 提取页面数据的主函数
function extractPageData() {
  const extractedData = [];
  
  // 1. 提取页面基本信息
  extractedData.push({
    type: 'page_info',
    title: document.title,
    url: window.location.href,
    extractedTime: new Date().toLocaleString('zh-CN')
  });
  
  // 2. 尝试提取表格数据
  const tableData = extractTableData();
  if (tableData.length > 0) {
    extractedData.push(...tableData);
  }
  
  // 3. 尝试提取列表数据（如果没有表格）
  if (tableData.length === 0) {
    const listData = extractListData();
    if (listData.length > 0) {
      extractedData.push(...listData);
    }
  }
  
  // 4. 尝试提取段落数据（如果没有表格和列表）
  if (tableData.length === 0 && extractedData.length === 1) { // 只有page_info
    const paragraphData = extractParagraphData();
    if (paragraphData.length > 0) {
      extractedData.push(...paragraphData);
    }
  }
  
  return extractedData;
}

// 提取表格数据
function extractTableData() {
  const tables = document.querySelectorAll('table');
  const tableResults = [];
  
  tables.forEach((table, tableIndex) => {
    // 检查表格是否有足够的数据行
    const rows = table.querySelectorAll('tr');
    if (rows.length < 2) return;
    
    const headers = [];
    const dataRows = [];
    
    // 尝试获取表头
    const thead = table.querySelector('thead');
    if (thead) {
      const headerCells = thead.querySelectorAll('th, td');
      headerCells.forEach(cell => {
        headers.push(sanitizeText(cell.textContent));
      });
    } else {
      // 从第一行获取表头
      const firstRowCells = rows[0].querySelectorAll('th, td');
      firstRowCells.forEach(cell => {
        headers.push(sanitizeText(cell.textContent));
      });
    }
    
    // 提取数据行（跳过表头行）
    const startRow = thead ? 0 : 1;
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const rowData = {};
      const cells = row.querySelectorAll('td, th');
      
      // 确保有单元格才处理
      if (cells.length === 0) continue;
      
      cells.forEach((cell, index) => {
        const header = headers[index] || `列${index + 1}`;
        rowData[header] = sanitizeText(cell.textContent);
      });
      
      // 确保行数据不为空
      const hasData = Object.values(rowData).some(value => value.trim().length > 0);
      if (hasData) {
        dataRows.push(rowData);
      }
    }
    
    // 如果有数据行，添加到结果
    if (dataRows.length > 0) {
      tableResults.push({
        type: 'table',
        tableIndex: tableIndex + 1,
        headers: headers,
        rows: dataRows
      });
    }
  });
  
  return tableResults;
}

// 提取列表数据
function extractListData() {
  const lists = document.querySelectorAll('ul, ol');
  const listResults = [];
  
  lists.forEach((list, listIndex) => {
    const items = list.querySelectorAll('li');
    // 只处理有足够项目的列表
    if (items.length < 3) return;
    
    const listItems = [];
    items.forEach((item, index) => {
      const text = sanitizeText(item.textContent);
      if (text.length > 0) {
        listItems.push({
          序号: index + 1,
          内容: text
        });
      }
    });
    
    if (listItems.length > 0) {
      listResults.push({
        type: 'list',
        listIndex: listIndex + 1,
        listType: list.tagName.toLowerCase(),
        items: listItems
      });
    }
  });
  
  return listResults;
}

// 提取段落数据
function extractParagraphData() {
  const paragraphs = document.querySelectorAll('p');
  const paragraphItems = [];
  
  paragraphs.forEach((p, index) => {
    const text = sanitizeText(p.textContent);
    // 只提取有意义长度的段落
    if (text.length > 20) {
      paragraphItems.push({
        序号: index + 1,
        内容: text
      });
    }
  });
  
  return paragraphItems.length > 0 ? [{
    type: 'paragraphs',
    items: paragraphItems
  }] : [];
}

// 清理文本内容
function sanitizeText(text) {
  return text
    .replace(/\s+/g, ' ') // 替换多个空格为单个空格
    .replace(/^\s+|\s+$/g, '') // 去除首尾空格
    .replace(/[\n\r]+/g, ' ') // 替换换行符为空格
    .trim();
}

// 高亮显示提取的数据（用于调试）
function highlightExtractedElements(elements) {
  elements.forEach(element => {
    const originalStyle = element.style.cssText;
    element.style.cssText += 'background-color: yellow; border: 2px solid blue;';
    
    // 5秒后恢复原始样式
    setTimeout(() => {
      element.style.cssText = originalStyle;
    }, 5000);
  });
}

// 暴露一些功能给window对象，便于调试
if (typeof window !== 'undefined') {
  window.webScraper = {
    extractData: extractPageData,
    highlightElements: highlightExtractedElements
  };
}