const { io } = require('../../client/node_modules/socket.io-client');

const socket = io('http://localhost:4000');

socket.on('connect', () => {
  console.log('Interviewer connected to socket server with id:', socket.id);
  
  socket.emit('JOIN_INTERVIEW', {
    sessionId: 1,
    role: 'interviewer',
    name: 'Dr. Sarah Chen',
  });

  // Listen for candidate events
  socket.on('CODE_CHANGED', (data) => {
    console.log('[Interviewer Received CODE_CHANGED]:', data.questionId, 'len:', data.sourceCode.length);
  });

  socket.on('CODE_EXECUTED', (data) => {
    console.log('[Interviewer Received CODE_EXECUTED]:', data);
  });

  socket.on('CODE_SUBMITTED', (data) => {
    console.log('[Interviewer Received CODE_SUBMITTED]:', data);
  });

  socket.on('CHAT_MESSAGE', (data) => {
    console.log('[Interviewer Received CHAT_MESSAGE]:', data.sender, ':', data.text);
  });

  const action = process.argv[2] || 'open_question';

  if (action === 'send_chat') {
    socket.emit('CHAT_MESSAGE', {
      id: 'msg-' + Date.now(),
      sessionId: 1,
      sender: 'Dr. Sarah Chen',
      senderRole: 'interviewer',
      text: 'Hello Alice! Welcome to the interview. Today we will solve an algorithmic problem.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    });
    setTimeout(() => {
      console.log('Chat message sent successfully.');
      socket.disconnect();
      process.exit(0);
    }, 1000);
  } else if (action === 'send_question_card') {
    socket.emit('CHAT_MESSAGE', {
      id: 'msg-qc-' + Date.now(),
      sessionId: 1,
      sender: 'Dr. Sarah Chen',
      senderRole: 'interviewer',
      text: "I've shared the problem Two Sum with you.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'question_card',
      questionId: 1,
      title: 'Two Sum',
      difficulty: 'easy',
    });
    setTimeout(() => {
      console.log('Question card sent successfully.');
      socket.disconnect();
      process.exit(0);
    }, 1000);
  } else if (action === 'open_question') {
    socket.emit('QUESTION_OPENED', {
      sessionId: 1,
      questionId: 1,
      title: 'Two Sum',
      difficulty: 'easy',
    });
    setTimeout(() => {
      console.log('QUESTION_OPENED emitted successfully.');
      socket.disconnect();
      process.exit(0);
    }, 1000);
  } else if (action === 'listen') {
    console.log('Listening for candidate actions for 30s...');
    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 30000);
  }
});
