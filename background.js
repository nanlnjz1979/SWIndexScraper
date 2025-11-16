// 后台脚本，处理扩展的主要功能

// 向popup.js发送状态更新消息
function sendStatusUpdate(message, type = '') {
  try {
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      message: message,
      type: type
    });
  } catch (error) {
    console.error('发送状态更新失败:', error);
  }
}

// 监听来自popup.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 捕获所有消息并发送状态更新
  console.log('收到消息:', message.action);
  sendStatusUpdate(`正在处理: ${message.action}`, 'loading');
  
  if (message.action === 'statusUpdate') {
    // 忽略状态更新消息，避免循环
    return false;
  }
  
  switch (message.action) {
    case 'openUrl':
      // 首先验证URL格式
      let validatedUrl = message.url;
      sendStatusUpdate('正在验证URL格式...', 'loading');
      
      // URL有效性验证
      try {
        // 确保URL有协议
        if (!validatedUrl.startsWith('http://') && !validatedUrl.startsWith('https://')) {
          validatedUrl = 'https://' + validatedUrl;
        }
        
        // 验证URL格式
        new URL(validatedUrl);
        
        // URL验证通过
        sendStatusUpdate('URL验证通过，正在打开新标签页...', 'loading');
        
        // 打开指定的URL
        chrome.tabs.create({
          url: validatedUrl,
          active: true
        }, (tab) => {
          if (chrome.runtime.lastError) {
              // 如果标签页创建失败
              sendStatusUpdate('无法打开标签页: ' + chrome.runtime.lastError.message, 'error');
              sendResponse({ 
                success: false, 
                message: '无法打开标签页: ' + chrome.runtime.lastError.message 
              });
            } else {
              // 在创建标签页后立即发送成功响应
              sendStatusUpdate('URL已在新标签页中打开', 'success');
              sendResponse({ 
                success: true, 
                message: 'URL已在新标签页中打开',
                url: validatedUrl 
              });
            
            // 仍然尝试在页面加载完成后执行后续操作，但不依赖它进行响应
            if (typeof chrome.tabs.onUpdated !== 'undefined') {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === tab.id && info.status === 'complete') {
                  chrome.tabs.onUpdated.removeListener(listener);
                }
              });
            }
          }
        });
      } catch (error) {
        // URL验证失败
        sendStatusUpdate('无效的URL格式: ' + error.message, 'error');
        sendResponse({ 
          success: false, 
          message: '无效的URL格式: ' + error.message 
        });
        return false; // 验证失败，不需要保持通道开放
      }
      
      return true; // 保持消息通道开放以等待标签页创建的回调
      
    case 'exportToCsv':
      // 将数据导出为CSV文件
      sendStatusUpdate('正在准备导出CSV文件...', 'loading');
      
      // 调用exportToCsv函数，并将sendResponse作为回调传递
      exportToCsv(message.data, message.filename || 'export.csv', sendResponse);
      
      // 返回true以保持消息通道开放，等待异步下载操作完成
      return true;
      
    case 'extractPageData':
      // 从当前活动标签页提取数据
      console.log('收到extractPageData消息，开始提取数据');
      sendStatusUpdate('正在准备提取页面数据...', 'loading');
      
      // 检查chrome.tabs API是否可用
      if (typeof chrome.tabs === 'undefined') {
        console.error('chrome.tabs API不可用');
        sendResponse({ success: false, message: 'tabs API不可用' });
        return false;
      }
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error('查询标签页失败:', chrome.runtime.lastError);
          sendResponse({ success: false, message: '查询标签页失败: ' + chrome.runtime.lastError.message });
          return;
        }
        
        if (tabs.length > 0) {
          console.log('找到活动标签页，标签ID:', tabs[0].id);
          
          // 检查chrome.scripting API是否可用
          if (typeof chrome.scripting === 'undefined') {
            console.error('chrome.scripting API不可用');
            sendResponse({ success: false, message: 'scripting API不可用' });
            return;
          }
          
          try {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: extractDataFromPage
            }, (results) => {
              if (chrome.runtime.lastError) {
                console.error('执行脚本失败:', chrome.runtime.lastError);
                sendResponse({ success: false, message: '执行脚本失败: ' + chrome.runtime.lastError.message });
                return;
              }
              
              console.log('脚本执行完成，结果:', results);
              if (results && results[0]) {
                const data = results[0].result;
                let itemCount = 0;
                if (data.tables && data.tables.length) {
                  itemCount = data.tables.reduce((sum, table) => sum + table.rows.length, 0);
                } else if (data.lists && data.lists.length) {
                  itemCount = data.lists.reduce((sum, list) => sum + list.items.length, 0);
                }
                sendStatusUpdate(`数据提取成功，共找到 ${itemCount} 条记录`, 'success');
                sendResponse({ success: true, data: data });
              } else {
                sendStatusUpdate('未找到可提取的数据', 'error');
                sendResponse({ success: false, message: '无法提取页面数据，结果为空' });
              }
            });
          } catch (error) {
              console.error('脚本执行异常:', error);
              sendStatusUpdate('脚本执行异常: ' + error.message, 'error');
              sendResponse({ success: false, message: '执行脚本异常: ' + error.message });
            }
        } else {
          console.log('没有找到活动标签页');
          sendStatusUpdate('没有找到活动标签页', 'error');
          sendResponse({ success: false, message: '没有活动标签页' });
        }
      });
      return true; // 保持消息通道开放，等待异步响应
  }
});

// 从页面提取数据的函数
function extractDataFromPage() {
  // 添加日志以确认函数被执行
  console.log('extractDataFromPage函数已被注入并执行');
  
  // 这里是默认的数据提取逻辑，可以根据需要修改
  const data = [];
  
  // 优先尝试提取JSON数据
  console.log('尝试提取JSON数据...');
  
  // 尝试从页面文本内容中提取JSON
  const pageText = document.body.textContent.trim();
  
  // 方法1: 检查整个页面内容是否是有效的JSON
  try {
    const jsonData = JSON.parse(pageText);
    console.log('找到有效的JSON数据');
    
    // 检查JSON数据结构，特别是用户提到的数据格式 {"data":[...]} 
    if (jsonData && Array.isArray(jsonData.data)) {
      console.log('找到data数组，长度为:', jsonData.data.length);
      
      // 提取数据数组中的第一条记录的键作为表头
      if (jsonData.data.length > 0) {
        const headers = Object.keys(jsonData.data[0]);
        const rows = jsonData.data.map((item, index) => {
          const rowData = {};
          headers.forEach(header => {
            // 处理特殊值如null等
            rowData[header] = item[header] === null || item[header] === undefined ? '' : String(item[header]);
          });
          return rowData;
        });
        
        data.push({
          type: 'table',
          tableIndex: 1,
          headers: headers,
          rows: rows
        });
        
        console.log('成功提取JSON数据为表格格式');
        return data;
      }
    }
  } catch (error) {
    console.log('页面整体不是有效的JSON或解析出错:', error.message);
  }
  
  // 方法2: 尝试在页面内容中查找JSON格式的文本块
  try {
    // 尝试匹配常见的JSON数据结构模式
    const jsonPatterns = [
      /\{\s*"data"\s*:\s*\[/g,  // 匹配 {"data":[ 模式
      /\[\{[^{}]*\}\]/g,          // 匹配 [{...}] 模式
      /\{[^{}]*\}/g                // 匹配 {...} 模式
    ];
    
    for (const pattern of jsonPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        for (const matchStr of match) {
          try {
            // 尝试修复部分JSON字符串
            let jsonStr = matchStr;
            
            // 如果匹配的是部分JSON，尝试扩展匹配范围
            if (matchStr.startsWith('{"data":[')) {
              // 查找对应的结束括号
              let startIndex = pageText.indexOf(matchStr);
              let bracketCount = 1;
              let endIndex = startIndex + matchStr.length;
              
              while (endIndex < pageText.length && bracketCount > 0) {
                const char = pageText[endIndex];
                if (char === '[') bracketCount++;
                if (char === ']') bracketCount--;
                endIndex++;
              }
              
              // 获取完整的JSON字符串
              if (bracketCount === 0) {
                jsonStr = pageText.substring(startIndex, endIndex - 1) + ']}';
              }
            }
            
            const partialJson = JSON.parse(jsonStr);
            console.log('找到部分JSON数据');
            
            // 如果是用户提到的数据格式，进行处理
            if (partialJson && Array.isArray(partialJson.data)) {
              const headers = Object.keys(partialJson.data[0]);
              const rows = partialJson.data.map((item) => {
                const rowData = {};
                headers.forEach(header => {
                  rowData[header] = item[header] === null || item[header] === undefined ? '' : String(item[header]);
                });
                return rowData;
              });
              
              data.push({
                type: 'table',
                tableIndex: 1,
                headers: headers,
                rows: rows
              });
              
              console.log('成功从部分内容提取JSON数据');
              return data;
            } else if (Array.isArray(partialJson)) {
              // 如果直接是数组
              if (partialJson.length > 0 && typeof partialJson[0] === 'object') {
                const headers = Object.keys(partialJson[0]);
                const rows = partialJson.map((item) => {
                  const rowData = {};
                  headers.forEach(header => {
                    rowData[header] = item[header] === null || item[header] === undefined ? '' : String(item[header]);
                  });
                  return rowData;
                });
                
                data.push({
                  type: 'table',
                  tableIndex: 1,
                  headers: headers,
                  rows: rows
                });
                
                console.log('成功从数组提取JSON数据');
                return data;
              }
            }
          } catch (e) {
            console.log('解析部分JSON失败:', e.message);
          }
        }
      }
    }
  } catch (error) {
    console.log('查找JSON文本块出错:', error.message);
  }
  
  console.log('未找到可直接解析的JSON数据，继续尝试其他提取方法');
  
  // 尝试提取表格数据
  const tables = document.querySelectorAll('table');
  console.log('找到表格数量:', tables.length);
  if (tables.length > 0) {
    tables.forEach((table, tableIndex) => {
      const headers = [];
      const rows = [];
      
      // 获取表头
      const headerCells = table.querySelectorAll('thead th, thead td');
      if (headerCells.length > 0) {
        headerCells.forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      } else {
        // 如果没有thead，尝试从第一行获取表头
        const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td');
        firstRowCells.forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      }
      
      // 获取数据行
      const dataRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      dataRows.forEach(row => {
        const rowData = {};
        const cells = row.querySelectorAll('td, th');
        
        cells.forEach((cell, index) => {
          const header = headers[index] || `列${index + 1}`;
          rowData[header] = cell.textContent.trim();
        });
        
        if (Object.keys(rowData).length > 0) {
          rows.push(rowData);
        }
      });
      
      if (rows.length > 0) {
        data.push({
          type: 'table',
          tableIndex: tableIndex + 1,
          headers: headers,
          rows: rows
        });
      }
    });
  }
  
  // 如果没有找到表格，尝试提取列表数据
  if (data.length === 0) {
    const lists = document.querySelectorAll('ul, ol');
    lists.forEach((list, listIndex) => {
      const items = [];
      const listItems = list.querySelectorAll('li');
      
      listItems.forEach((item, index) => {
        items.push({
          序号: index + 1,
          内容: item.textContent.trim()
        });
      });
      
      if (items.length > 0) {
        data.push({
          type: 'list',
          listIndex: listIndex + 1,
          items: items
        });
      }
    });
  }
  
  // 如果仍然没有找到数据，提取所有段落文本
  if (data.length === 0) {
    const paragraphs = [];
    const pElements = document.querySelectorAll('p');
    
    pElements.forEach((p, index) => {
      const text = p.textContent.trim();
      if (text.length > 0) {
        paragraphs.push({
          序号: index + 1,
          内容: text
        });
      }
    });
    
    if (paragraphs.length > 0) {
      data.push({
        type: 'paragraphs',
        items: paragraphs
      });
    }
  }  
  // 返回提取的数据
  return data;
}

// 将数据导出为CSV文件
function exportToCsv(data, filename, callback) {
  // 确保文件名以.csv结尾
  if (!filename.endsWith('.csv')) {
    filename += '.csv';
  }
  
  sendStatusUpdate('正在处理数据并生成CSV内容...', 'loading');
  
  // 将数据转换为CSV格式
  let csvContent = '';
  
  if (Array.isArray(data)) {
    data.forEach(item => {
      // 处理不同类型的数据
      if (item.type === 'table' && item.rows && Array.isArray(item.rows)) {
        // 添加表格标题
        csvContent += `\n=== 表格 ${item.tableIndex || 1} ===\n`;
        
        // 添加表头
        if (item.headers && Array.isArray(item.headers)) {
          csvContent += item.headers.map(header => `"${header.replace(/"/g, '""')}"`).join(',') + '\n';
        }
        
        // 添加数据行
        item.rows.forEach(row => {
          if (item.headers && Array.isArray(item.headers)) {
            const rowValues = item.headers.map(header => {
              const value = row[header] || '';
              return `"${value.replace(/"/g, '""')}"`;
            });
            csvContent += rowValues.join(',') + '\n';
          } else if (typeof row === 'object' && row !== null) {
            // 如果没有headers但row是对象，则使用对象的所有键
            const keys = Object.keys(row);
            const rowValues = keys.map(key => {
              const value = row[key] || '';
              return `"${value.replace(/"/g, '""')}"`;
            });
            csvContent += rowValues.join(',') + '\n';
          }
        });
      } else if ((item.type === 'list' || item.type === 'paragraphs') && item.items && Array.isArray(item.items)) {
        // 添加列表或段落标题
        const typeName = item.type === 'list' ? `列表 ${item.listIndex || 1}` : '段落';
        csvContent += `\n=== ${typeName} ===\n`;
        
        // 获取所有可能的键作为表头
        const allKeys = new Set();
        item.items.forEach(row => {
          if (typeof row === 'object' && row !== null) {
            Object.keys(row).forEach(key => allKeys.add(key));
          }
        });
        const headers = Array.from(allKeys);
        
        // 添加表头
        csvContent += headers.map(header => `"${header.replace(/"/g, '""')}"`).join(',') + '\n';
        
        // 添加数据行
        item.items.forEach(row => {
          if (typeof row === 'object' && row !== null) {
            const rowValues = headers.map(header => {
              const value = row[header] || '';
              return `"${value.replace(/"/g, '""')}"`;
            });
            csvContent += rowValues.join(',') + '\n';
          }
        });
      }
      // 处理可能的直接数据数组（兼容其他数据格式）
      else if (Array.isArray(item.rows) && !item.headers) {
        item.rows.forEach(row => {
          if (typeof row === 'object' && row !== null) {
            const keys = Object.keys(row);
            const values = keys.map(key => `"${(row[key] || '').replace(/"/g, '""')}"`);
            csvContent += values.join(',') + '\n';
          }
        });
      }
    });
    
    // 如果没有生成任何CSV内容但数据存在，尝试直接处理数组中的第一个有效对象
    if (csvContent === '' && data.length > 0) {
      const firstItem = data[0];
      if (firstItem && firstItem.rows && Array.isArray(firstItem.rows) && firstItem.rows.length > 0) {
        // 添加表头
        if (firstItem.headers && Array.isArray(firstItem.headers)) {
          csvContent += firstItem.headers.map(header => `"${header.replace(/"/g, '""')}"`).join(',') + '\n';
          
          // 添加数据行
          firstItem.rows.forEach(row => {
            const rowValues = firstItem.headers.map(header => {
              const value = row[header] || '';
              return `"${value.replace(/"/g, '""')}"`;
            });
            csvContent += rowValues.join(',') + '\n';
          });
        }
      }
    }
  }
  
  // 如果没有数据，提供一个默认消息
  if (csvContent === '') {
    csvContent = '没有找到可导出的数据';
  }
  
  try {
    // 检查数据大小，过大可能导致性能问题
    const csvSize = new Blob([csvContent]).size;
    console.log('CSV内容大小:', csvSize, '字节');
    
    // 对于非常大的CSV文件，添加警告
    if (csvSize > 10 * 1024 * 1024) { // 10MB
      sendStatusUpdate(`CSV文件较大(${Math.round(csvSize/1024/1024)}MB)，正在处理...`, 'loading');
    }
    
    // 优化创建Blob和下载过程
    sendStatusUpdate('正在准备下载文件...', 'loading');
    
    // 分步骤创建，避免长时间阻塞
    setTimeout(() => {
      try {
        // 创建Blob对象
        const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        sendStatusUpdate('文件准备完成，正在准备下载...', 'loading');
        
        // 在Chrome扩展中，直接使用blob作为downloads API的数据
        // 首先将Blob转换为Data URL
        const reader = new FileReader();
        reader.onload = function(event) {
          try {
            const dataUrl = event.target.result;
            sendStatusUpdate('正在开始下载...', 'loading');
            
            // 使用chrome.downloads API下载文件
            chrome.downloads.download({
              url: dataUrl,
              filename: filename,
              saveAs: true
            }, (downloadId) => {
              try {
                if (chrome.runtime.lastError) {
                  console.error('下载失败:', chrome.runtime.lastError);
                  sendStatusUpdate('CSV文件下载失败: ' + chrome.runtime.lastError.message, 'error');
                  
                  // 如果提供了回调，通知下载失败
                  if (callback) {
                    callback({ 
                      success: false, 
                      message: 'CSV文件下载失败: ' + chrome.runtime.lastError.message 
                    });
                  }
                } else {
                  console.log('CSV文件已下载，ID:', downloadId);
                  sendStatusUpdate('CSV文件已成功下载', 'success');
                  
                  // 如果提供了回调，通知下载成功
                  if (callback) {
                    callback({ 
                      success: true, 
                      message: 'CSV文件已成功下载' 
                    });
                  }
                }
              } catch (downloadError) {
                  console.error('下载处理过程中出错:', downloadError);
                  sendStatusUpdate('处理下载响应时出错: ' + downloadError.message, 'error');
                  
                  // 如果提供了回调，通知下载过程出错
                  if (callback) {
                    callback({ 
                      success: false, 
                      message: '处理下载响应时出错: ' + downloadError.message 
                    });
                  }
                } finally {
                  // 清理资源
                  try {
                    // 注意：Data URL不需要显式释放
                    console.log('下载操作完成，资源已清理');
                  } catch (cleanupError) {
                    console.error('清理资源时出错:', cleanupError);
                  }
                }
              });
            } catch (readerError) {
              console.error('文件读取过程中出错:', readerError);
              sendStatusUpdate('准备下载数据时出错: ' + readerError.message, 'error');
              
              // 如果提供了回调，通知读取过程出错
              if (callback) {
                callback({ 
                  success: false, 
                  message: '准备下载数据时出错: ' + readerError.message 
                });
              }
            }
          };
          
          // 开始读取Blob数据
          reader.readAsDataURL(blob);
        } catch (blobError) {
          console.error('创建Blob对象时出错:', blobError);
          sendStatusUpdate('创建CSV文件时出错: ' + blobError.message, 'error');
          
          // 如果提供了回调，通知创建Blob失败
          if (callback) {
            callback({ 
              success: false, 
              message: '创建CSV文件时出错: ' + blobError.message 
            });
          }
        }
      }, 100);
    } catch (error) {
      console.error('CSV导出过程中出错:', error);
      sendStatusUpdate('CSV导出失败: ' + error.message, 'error');
      
      // 如果提供了回调，通知导出失败
      if (callback) {
        callback({ 
          success: false, 
          message: 'CSV导出失败: ' + error.message 
        });
      }
    }
  }