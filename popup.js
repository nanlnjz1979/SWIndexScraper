// popup.js - 处理用户界面交互

// 全局变量
let extractedData = null;

// DOM元素
const urlInput = document.getElementById('urlInput');
const openUrlBtn = document.getElementById('openUrlBtn');
const extractDataBtn = document.getElementById('extractDataBtn');
const filenameInput = document.getElementById('filenameInput');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const statusDiv = document.getElementById('status');

// 初始化
function init() {
    // 添加事件监听器
    openUrlBtn.addEventListener('click', handleOpenUrl);
    extractDataBtn.addEventListener('click', handleExtractData);
    exportCsvBtn.addEventListener('click', handleExportCsv);
    
    // 添加消息监听器，接收来自background.js的状态更新
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'statusUpdate') {
            updateStatus(message.message, message.type);
        }
    });
    
    // 从本地存储加载上次使用的URL和文件名
    //loadSettings();
    
    // 当用户输入时自动启用导出按钮（如果已有数据）
    filenameInput.addEventListener('input', () => {
        exportCsvBtn.disabled = !extractedData || !filenameInput.value.trim();
    });
}

// 处理打开URL按钮点击
function handleOpenUrl() {
    const url = urlInput.value.trim();
    
    if (!url) {
        updateStatus('请输入有效的URL', 'error');
        return;
    }
    
    // 保存设置并打开URL
    // 详细的URL验证将在background.js中进行，这里保持简洁
    saveSettings();
    //url = "https://legulegu.com/api/stockdata/sw-industry-2021?industryCode=801016.SI&token=167ad0956978cc482fe2edd0cb3dabd7"
    openTabWithUrl(url);
    
    // 记录用户操作到控制台，便于调试
    console.log('用户请求打开URL:', url);
}

// 打开指定URL的标签页
function openTabWithUrl(url) {
    updateStatus('正在验证并打开URL...', 'loading');
    
    chrome.runtime.sendMessage(
        { action: 'openUrl', url: url },
        (response) => {
            if (chrome.runtime.lastError) {
                // 显示Chrome运行时错误
                updateStatus('操作失败: ' + chrome.runtime.lastError.message, 'error');
                console.error('消息发送错误:', chrome.runtime.lastError);
                return;
            }
            
            if (response) {
                if (response.success) {
                    // 显示成功信息，并包含实际打开的URL
                    updateStatus(`URL已成功打开: ${response.url}`, 'success');
                    
                    // 提示用户页面加载完成后可以提取数据
                    setTimeout(() => {
                        updateStatus('页面内容正在显示，请等待加载完成后点击「提取当前页面数据」按钮', '');
                    }, 2000);
                } else {
                    // 显示详细的错误信息，从background.js传递过来
                    updateStatus(`无法打开URL: ${response.message || '未知错误'}`, 'error');
                    console.error('URL打开失败:', response.message);
                }
            } else {
                // 没有收到响应的情况
                updateStatus('未收到响应，请检查扩展状态', 'error');
                console.error('未收到来自background.js的响应');
            }
        }
    );
}

// 处理提取数据按钮点击
function handleExtractData() {
    console.log('handleExtractData: 用户点击了提取数据按钮');
    updateStatus('正在提取页面数据...', 'loading');
    
    // 检查chrome.runtime API是否可用
    if (typeof chrome.runtime === 'undefined' || !chrome.runtime.sendMessage) {
        console.error('chrome.runtime.sendMessage API不可用');
        updateStatus('API调用失败: runtime.sendMessage不可用', 'error');
        return;
    }
    
    chrome.runtime.sendMessage(
        { action: 'extractPageData' },
        (response) => {
            console.log('handleExtractData: 收到消息响应', response);
            
            if (chrome.runtime.lastError) {
                console.error('handleExtractData: 消息发送失败', chrome.runtime.lastError);
                updateStatus('提取数据失败: ' + chrome.runtime.lastError.message, 'error');
                return;
            }
            
            if (response) {
                console.log('handleExtractData: 响应状态', response.success);
                
                if (response.success && response.data) {
                    extractedData = response.data;
                    console.log('handleExtractData: 成功提取数据', response.data);
                    updateStatus('成功提取数据，共 ' + countTotalItems(extractedData) + ' 条记录', 'success');
                    
                    // 启用导出按钮
                    exportCsvBtn.disabled = !filenameInput.value.trim();
                    
                    // 显示提取的数据摘要
                    showDataSummary(response.data);
                } else {
                    const errorMessage = response.message || '未找到可提取的数据';
                    console.log('handleExtractData: 提取失败', errorMessage);
                    updateStatus(errorMessage, 'error');
                    extractedData = null;
                    exportCsvBtn.disabled = true;
                }
            } else {
                console.error('handleExtractData: 未收到任何响应');
                updateStatus('未收到响应，请检查扩展后台进程', 'error');
                extractedData = null;
                exportCsvBtn.disabled = true;
            }
        }
    );
}

// 处理导出CSV按钮点击
function handleExportCsv() {
    if (!extractedData) {
        updateStatus('没有可导出的数据', 'error');
        return;
    }
    
    let filename = filenameInput.value.trim();
    if (!filename) {
        filename = 'export';
    }
    
    // 确保文件名以.csv结尾
    if (!filename.endsWith('.csv')) {
        filename += '.csv';
    }
    
    updateStatus('正在导出CSV文件...', 'loading');
    
    chrome.runtime.sendMessage(
        { action: 'exportToCsv', data: extractedData, filename: filename },
        (response) => {
            if (chrome.runtime.lastError) {
                updateStatus('导出失败: ' + chrome.runtime.lastError.message, 'error');
                return;
            }
            
            if (response && response.success) {
                updateStatus('CSV文件已导出', 'success');
                saveSettings();
            } else {
                updateStatus('导出CSV文件失败', 'error');
            }
        }
    );
}

// 更新状态显示
function updateStatus(message, type = '') {
    statusDiv.textContent = message;
    
    // 移除所有状态类
    statusDiv.classList.remove('success', 'error', 'loading');
    
    // 添加指定的状态类
    if (type) {
        statusDiv.classList.add(type);
    }
}

// 验证URL格式
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

// 计算提取数据的总记录数
function countTotalItems(data) {
    let count = 0;
    
    if (Array.isArray(data)) {
        data.forEach(item => {
            if (item.rows && Array.isArray(item.rows)) {
                count += item.rows.length;
            } else if (item.items && Array.isArray(item.items)) {
                count += item.items.length;
            }
        });
    }
    
    return count;
}

// 显示数据摘要
function showDataSummary(data) {
    let summary = '提取的数据包含：';
    const tableCount = data.filter(item => item.type === 'table').length;
    const listCount = data.filter(item => item.type === 'list').length;
    const paragraphCount = data.filter(item => item.type === 'paragraphs').length;
    
    const parts = [];
    if (tableCount > 0) parts.push(`${tableCount} 个表格`);
    if (listCount > 0) parts.push(`${listCount} 个列表`);
    if (paragraphCount > 0) parts.push(`${paragraphCount} 组段落`);
    
    summary += parts.join('、');
    
    // 使用setTimeout来确保状态更新后再显示摘要
    setTimeout(() => {
        updateStatus(summary, 'success');
    }, 1000);
}

// 保存设置到本地存储
function saveSettings() {
    if (!chrome.storage || !chrome.storage.local) {
        console.error('chrome.storage API 不可用');
        return;
    }
    const settings = {
        url: urlInput.value.trim(),
        filename: filenameInput.value.trim()
    };
    
    // 添加错误处理
    chrome.storage.local.set(settings, () => {
        if (chrome.runtime.lastError) {
            console.error('保存设置失败:', chrome.runtime.lastError);
            // 可以选择在这里显示错误消息给用户
            // updateStatus('保存设置失败: ' + chrome.runtime.lastError.message, 'error');
        } else {
            console.log('设置已成功保存');
        }
    });
}

// 从本地存储加载设置
function loadSettings() {
    chrome.storage.local.get(['url', 'filename'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('加载设置失败:', chrome.runtime.lastError);
            return;
        }
        
        if (result.url) {
            urlInput.value = result.url;
        }
        if (result.filename) {
            filenameInput.value = result.filename;
        }
        
        console.log('设置已成功加载');
    });
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);