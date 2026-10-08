const { io } = require('../../client/node_modules/socket.io-client');

setTimeout(() => {
  console.log('[Trigger] Connecting to Socket.IO server...');
  const socket = io('http://localhost:4000');

  socket.on('connect', () => {
    console.log('[Trigger] Connected as interviewer, joining room interview:1');
    socket.emit('JOIN_INTERVIEW', {
      sessionId: 1,
      role: 'interviewer',
      name: 'Dr. Sarah Chen',
    });

    setTimeout(() => {
      console.log('[Trigger] Emitting QUESTION_OPENED for Question 1 (Two Sum)...');
      socket.emit('QUESTION_OPENED', {
        sessionId: 1,
        questionId: 1,
        title: 'Two Sum',
        difficulty: 'easy',
      });

      // Also send a chat message with question card
      socket.emit('CHAT_MESSAGE', {
        id: 'msg-' + Date.now(),
        sessionId: 1,
        sender: 'Dr. Sarah Chen',
        senderRole: 'interviewer',
        text: 'I have assigned the problem: Two Sum. You can now begin writing your code in the editor.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'question_card',
        questionId: 1,
        title: 'Two Sum',
        difficulty: 'easy',
      });

      setTimeout(() => {
        console.log('[Trigger] Done emitting.');
        socket.disconnect();
      }, 1000);
    }, 1000);
  });
}, 2000);
