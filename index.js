const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

let mainWindow;
let messageHistory = [];
let listOfHistories = [];

// Define centerWindow function
function centerWindow(height) {
    const { width, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    const x = Math.floor(width / 2 - 400);  // 400 is half of window width (800)
    const y = Math.floor(screenHeight / 2 - height / 2.5);
    mainWindow.setBounds({ x, y, width: 800, height });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 300,  // Set initial height
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true
        },
        transparent: true,
        frame: false,
        resizable: false,
        icon: path.join(__dirname, 'resources', 'icon.ico')
    });

    mainWindow.loadFile('index.html');

    // Initial size and position
    mainWindow.on('ready-to-show', () => {
        const defaultHeight = 320;
        centerWindow(defaultHeight);
    });

    // Shortcut handler
    globalShortcut.register('CommandOrControl+Alt+I', () => {
        if (mainWindow.isVisible() && mainWindow.isFocused()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
            centerWindow(320);
            messageHistory = [];
            mainWindow.webContents.send('clear-input');
            mainWindow.webContents.send('clear-response');
        }
    });

    let currentModel = 'deepseek-r1-distill-llama-70b'; // Default model

    ipcMain.handle('change-model', (event, newModel) => {
        currentModel = newModel;
    });

    // Message handler
    ipcMain.handle('send-message', async (event, message) => {
        try {
            centerWindow(600);
            
            messageHistory.push({
                role: "user",
                content: message
            });

            const messages = [
                { 
                    role: "system", 
                    content: "You are a helpful assistant. But you like to speak as if you are a young person who is into meme and internet culture. However you still want to answer each individual question as best as you can. Do not hallucinate. Also I want you to be aware of what you are saying and make sure it makes sense in english, along with the rest of your responses. Also make sure that you are not stuck in one specific topic if it seems like the topic has changed. Use emojis often. When sharing code examples, always wrap them in triple backticks with the language identifier, like: ```python or ```javascript, if it is latex then use ```markdown" 
                },
                ...messageHistory
            ];

        // Inside your IPC handler
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: currentModel,
            temperature: 0.6,
            max_tokens: 1024,
            top_p: 0.95,
            stream: true,
            stop: null,
            reasoning_format: "parsed"
        });

        let fullResponse = '';
        let thinkingTokens = ''; // Store each chunk of thinking

        for await (const chunk of chatCompletion) {
            // Extract the parsed reasoning token from the "reasoning" key
            const reasoningToken = chunk.choices[0]?.delta?.reasoning;
            if (reasoningToken ) {
                thinkingTokens += reasoningToken;
            }

            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                mainWindow.webContents.send('stream-response', content, thinkingTokens);
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // Send both the full response and thinking tokens to the UI
        mainWindow.webContents.send('complete-response', {
            fullResponse: fullResponse,
            thinkingTokens: thinkingTokens
        });

        messageHistory.push({ role: "assistant", content: fullResponse });

            if (messageHistory.length > 0) {
                listOfHistories = listOfHistories.filter(h => 
                    JSON.stringify(h) !== JSON.stringify(messageHistory.slice(0, -2))
                );
                listOfHistories.unshift([...messageHistory]);
            }
            
            return fullResponse;
        } catch (error) {
            console.error('Groq API Error:', error);
            return 'Error: Could not get response from AI';
        }
    });

    // Window resize handler
    ipcMain.on('resize-window', (event, size) => {
        const height = size === 'small' ? 320 : 600;
        centerWindow(height);
    });

    // Add this with your other ipcMain handlers
    ipcMain.handle('get-histories', () => {
        console.log('Current histories:', listOfHistories);
        return listOfHistories;
    });

    ipcMain.handle('load-history', (event, index) => {
        console.log('Loading history index:', index);
        if (index >= 0 && index < listOfHistories.length) {
            // Remove the conversation from histories
            const loadedHistory = listOfHistories.splice(index, 1)[0];
            // Set as current conversation
            messageHistory = [...loadedHistory];
            // Add it back to the start of histories immediately
            listOfHistories.unshift([...messageHistory]);
            console.log('Loaded history:', messageHistory);
            return messageHistory;
        }
        return null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
}); 