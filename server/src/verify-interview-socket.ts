import { io } from 'socket.io-client';
import axios from 'axios';

async function runTest() {
  console.log('Testing Interview Realtime Socket.IO (Code Updates, Execution, Submission)...');

  // 1. Login as interviewer to get JWT
  const loginRes = await axios.post('http://localhost:4000/api/auth/login', {
    email: 'admin@wissen.dev',
    password: 'Admin@123',
  });
  const token = loginRes.data.token;
  console.log('✅ Interviewer logged in with JWT');

  // 2. Fetch the existing test interview (Interview 1)
  const interviewRes = await axios.get('http://localhost:4000/api/interviews/1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const roomToken = interviewRes.data.roomToken;
  console.log(`✅ Retrieved interview 1 with roomToken: ${roomToken}`);

  // 3. Connect Candidate socket (using roomToken)
  const candidateSocket = io('http://localhost:4000', {
    auth: { roomToken, candidateName: 'Alex Mercer' },
    transports: ['websocket'],
  });

  // 4. Connect Interviewer socket (using JWT)
  const interviewerSocket = io('http://localhost:4000', {
    auth: { token, interviewId: 1 },
    transports: ['websocket'],
  });

  await new Promise<void>((resolve, reject) => {
    let receivedCodeChanged = false;
    let receivedCodeExecuted = false;
    let receivedCodeSubmitted = false;

    const timeout = setTimeout(() => {
      reject(new Error(`Test timed out! Received: codeChanged=${receivedCodeChanged}, codeExecuted=${receivedCodeExecuted}, codeSubmitted=${receivedCodeSubmitted}`));
    }, 15000);

    // Interviewer listens for events
    interviewerSocket.on('CODE_CHANGED', (data: any) => {
      console.log('✅ Interviewer received CODE_CHANGED:', data.code);
      receivedCodeChanged = true;
    });

    interviewerSocket.on('CODE_EXECUTED', (data: any) => {
      console.log('✅ Interviewer received CODE_EXECUTED:', data.result?.status?.description);
      receivedCodeExecuted = true;
    });

    interviewerSocket.on('CODE_SUBMITTED', (data: any) => {
      console.log('✅ Interviewer received CODE_SUBMITTED: score =', data.score);
      receivedCodeSubmitted = true;

      if (receivedCodeChanged && receivedCodeExecuted && receivedCodeSubmitted) {
        clearTimeout(timeout);
        candidateSocket.disconnect();
        interviewerSocket.disconnect();
        resolve();
      }
    });

    candidateSocket.on('connect', () => {
      console.log('✅ Candidate socket connected:', candidateSocket.id);

      // Join room with Ack
      candidateSocket.emit('JOIN_INTERVIEW', { roomToken, candidateName: 'Alex Mercer' }, (ack: any) => {
        console.log('✅ Candidate JOIN_INTERVIEW Ack received:', ack.success);

        // Step 1: Candidate emits UPDATE_CODE
        candidateSocket.emit('UPDATE_CODE', {
          code: 'def twoSum(): return [0, 1]',
          languageId: 71,
        }, (updateAck: any) => {
          console.log('✅ Candidate UPDATE_CODE Ack received:', updateAck.success);

          // Step 2: Candidate emits EXECUTE_CODE
          candidateSocket.emit('EXECUTE_CODE', {
            code: 'print("Executed live in test")',
            languageId: 71,
          }, (execAck: any) => {
            console.log('✅ Candidate EXECUTE_CODE Ack received:', execAck.success);

            // Step 3: Candidate emits SUBMIT_CODE
            candidateSocket.emit('SUBMIT_CODE', {
              questionId: 14,
              code: 'def twoSum(): return [0, 1]',
              languageId: 71,
            }, (submitAck: any) => {
              console.log('✅ Candidate SUBMIT_CODE Ack received: score =', submitAck.score);
            });
          });
        });
      });
    });

    interviewerSocket.on('connect', () => {
      console.log('✅ Interviewer socket connected:', interviewerSocket.id);
      interviewerSocket.emit('JOIN_INTERVIEW', { interviewId: 1 });
    });
  });

  console.log('🎉 Verified all: UPDATE_CODE, EXECUTE_CODE, and SUBMIT_CODE received at interviewer side with Acks!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
