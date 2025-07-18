const { ipcRenderer } = require('electron');
const responseDiv = document.getElementById('response');
const userInput = document.getElementById('userInput');
const historyButton = document.getElementById('historyButton');
const colorPicker = document.getElementById('colorPicker');
const modelPicker = document.getElementById('modelPicker');
const historyDropdown = document.getElementById('historyDropdown');
const reasoningDropdown = document.getElementById('reasoningDropdown');


let currentResponse = '';
let isGenerating = false;
let shouldStop = false;
let currentCodeBlock = '';
let isInCodeBlock = false;
let fullResponse = '';
let reasoningResponse = '';

// Input event listeners
userInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await sendMessage();
    }
});

// Handle streaming response
ipcRenderer.on('stream-response', (event, content, reasoning = "") => {
    fullResponse += content;
    reasoningResponse += reasoning;

    console.log('This is a message from the main process');

    responseDiv.innerHTML = `
        <details style="margin-top: -40px; margin-bottom: -40px; padding: 0;">
          <summary style="margin: 0; padding: 0; font-style: italic" class="thinkingDropdown">Thinking...</summary>
          <p style="color: white; margin-top: -60px; margin-bottom: -40px; padding: 0;">${reasoningResponse}</p>
        </details>
    `;

    // Process the fullResponse to split into parts (code blocks and text)
    const parts = fullResponse.split(/(```[\s\S]*?```)/g);
    parts.forEach(part => {
        if (part.startsWith('```')) {
            // Process code blocks as before
            const codeContent = part.replace(/```(\w+)?\n/, '').replace(/```$/, '');
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = codeContent;
            pre.appendChild(code);
            
            // Create and configure copy button (if needed)
            const copyButton = document.createElement('button');
            copyButton.textContent = 'Copy';
            // (Button styles and events remain unchanged)
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeContent).then(() => {
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => { 
                        copyButton.textContent = 'Copy';
                    }, 1500);
                });
            });
            pre.appendChild(copyButton);
            responseDiv.appendChild(pre);
            hljs.highlightElement(code);
        } else if (part.trim()) {
            // Process regular text and allow HTML formatting if needed
            const responseTextDiv = document.createElement('div');
            // You can include your bold formatting here if needed.
            responseTextDiv.innerHTML = part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            responseDiv.appendChild(responseTextDiv);
        }
    });
    
    // **Trigger KaTeX to render any LaTeX expressions in the updated response**
    renderMathInElement(responseTextDiv, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: true},
            {left: '\(', right: '\)', display: true},
            {left: '\\[', right: '\\]', display: true}
        ]
    });
    
    // Scroll to the bottom of the response container
    responseDiv.scrollTop = responseDiv.scrollHeight;
});




// Clear response handler
ipcRenderer.on('clear-response', () => {
    responseDiv.innerHTML = '';
    currentCodeBlock = '';
    isInCodeBlock = false;
    fullResponse = '';
});

ipcRenderer.on('clear-input', () => {
    userInput.value = '';
});

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message || isGenerating) return;

    try {
        isGenerating = true;
        responseDiv.textContent = ''; // Clear previous response
        fullResponse = ''; // Reset the full response
        await ipcRenderer.invoke('send-message', message);
        userInput.value = '';
    } catch (error) {
        responseDiv.textContent = 'Error: Could not get response';
    } finally {
        isGenerating = false;
    }
}

// Model picker handler
modelPicker.addEventListener('change', (e) => {
    ipcRenderer.invoke('change-model', e.target.value);
});

// Color picker handler
colorPicker.addEventListener('change', (e) => {
    document.querySelector('.title-bar').style.color = e.target.value;
    document.querySelector('.title-bar').style.textShadow = `
        0 0 5px ${e.target.value}80,
        0 0 10px ${e.target.value}4D,
        0 0 15px ${e.target.value}33
    `;
});

// History button handler
historyButton.addEventListener('click', async () => {
    try {
        const histories = await ipcRenderer.invoke('get-histories');
        
        // Toggle dropdown visibility
        if (historyDropdown.style.display === 'block') {
            historyDropdown.style.display = 'none';
            return;
        }
        
        // Clear previous history list
        historyDropdown.innerHTML = '';
        
        // Create history items
        histories.forEach((history, index) => {
            const userMessage = history.find(msg => msg.role === 'user')?.content || '';
            const assistantMessage = history.find(msg => msg.role === 'assistant')?.content || '';
            fullResponse = `User: ${userMessage}\n\nAssistant: ${assistantMessage}`;
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.textContent = truncateText(userMessage, 100);
            
            historyItem.addEventListener('click', async () => {
                const loadedHistory = await ipcRenderer.invoke('load-history', index);
                if (loadedHistory) {
                    displayLoadedHistory(loadedHistory);
                    historyDropdown.style.display = 'none';
                }
            });
            
            historyDropdown.appendChild(historyItem);
        });
        
        // Show the dropdown
        historyDropdown.style.display = 'block';
    } catch (error) {
        console.error('History error:', error);
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.history-button') && !event.target.closest('.history-dropdown')) {
        historyDropdown.style.display = 'none';
    }
});

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

// Helper function to display loaded history
function displayLoadedHistory(history) {
    // Clear current response
    responseDiv.innerHTML = '';
    fullResponse = '';
    
    // Format the full response with all messages in the conversation
    fullResponse = history.map(msg => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `${role}: ${msg.content}`;
    }).join('\n\n');
    
    // Process and display the response the same way as normal responses
    const parts = fullResponse.split(/(```[\s\S]*?```)/g);
    
    parts.forEach(part => {
        if (part.startsWith('```')) {
            const codeContent = part.replace(/```(\w+)?\n/, '').replace(/```$/, '');
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = codeContent;
            pre.appendChild(code);
            responseDiv.appendChild(pre);
            hljs.highlightElement(code);
        } else if (part.trim()) {
            const textNode = document.createTextNode(part);
            responseDiv.appendChild(textNode);
        }
    });

    // Ensure proper scrolling
    responseDiv.scrollTop = responseDiv.scrollHeight;
    
    // Resize window to show full content
    ipcRenderer.send('resize-window', 'large');
}