/**
 * UG Express - Real Concurrency Lab
 * ---------------------------------
 * Sends real HTTP requests to the PHP concurrency engine.
 * No real bus bookings are created.
 */

document.addEventListener('DOMContentLoaded', () => {

    const clientCountInput = document.getElementById('client-count');
    const experimentTypeSelect = document.getElementById('experiment-type');

    const startButton = document.getElementById('start-test');
    const resetButton = document.getElementById('reset-test');

    const totalClientsEl = document.getElementById('total-clients');
    const successfulEl = document.getElementById('successful-requests');
    const failedEl = document.getElementById('failed-requests');

    const resultsContainer = document.getElementById('client-results');
    const statusEl = document.getElementById('experiment-status');

    let running = false;

    // PHP endpoint relative to the concurrency-lab page
    const ENGINE_URL = '../../backend/api/concurrency-engine.php';

    // Initialize icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // --------------------------------------------------
    // Send a real HTTP request to PHP
    // --------------------------------------------------

    async function sendRequest(action, clientId = '') {

        const response = await fetch(ENGINE_URL, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action,
                clientId
            })
        });

        let data;

        try {
            data = await response.json();
        } catch (error) {
            data = {
                success: false,
                message: 'Invalid server response.'
            };
        }

        return {
            httpCode: response.status,
            success: response.ok && data.success === true,
            data
        };
    }

    // --------------------------------------------------
    // Reset dashboard display
    // --------------------------------------------------

    function resetDashboard() {

        totalClientsEl.textContent = '0';
        successfulEl.textContent = '0';
        failedEl.textContent = '0';

        resultsContainer.innerHTML = `
            <tr>
                <td colspan="5"
                    style="text-align:center;padding:2rem;color:var(--text-muted)">
                    No experiment has been started.
                </td>
            </tr>
        `;

        statusEl.textContent = 'Ready to run an experiment.';
        statusEl.style.color = 'var(--text-muted)';
    }

    // --------------------------------------------------
    // Create client table rows
    // --------------------------------------------------

    function createClientRows(count) {

        resultsContainer.innerHTML = '';

        for (let i = 1; i <= count; i++) {

            const row = document.createElement('tr');

            row.innerHTML = `
                <td style="padding:0.75rem">Client ${i}</td>
                <td id="status-${i}" style="padding:0.75rem">Waiting</td>
                <td id="http-${i}" style="padding:0.75rem">—</td>
                <td id="duration-${i}" style="padding:0.75rem">—</td>
                <td id="result-${i}" style="padding:0.75rem">Pending</td>
            `;

            resultsContainer.appendChild(row);
        }
    }

    // --------------------------------------------------
    // Update one client
    // --------------------------------------------------

    function updateClient(id, status, http, duration, result) {

        const statusEl = document.getElementById(`status-${id}`);
        const httpEl = document.getElementById(`http-${id}`);
        const durationEl = document.getElementById(`duration-${id}`);
        const resultEl = document.getElementById(`result-${id}`);

        if (statusEl) statusEl.textContent = status;
        if (httpEl) httpEl.textContent = http;
        if (durationEl) durationEl.textContent = duration;
        if (resultEl) resultEl.textContent = result;
    }

    // --------------------------------------------------
    // Execute one real client request
    // --------------------------------------------------

    async function runClient(id) {

        const startTime = performance.now();

        updateClient(
            id,
            'Sending request',
            'Pending',
            'Measuring...',
            'Request started'
        );

        try {

            const response = await sendRequest('claim', `Client-${id}`);

            const duration = Math.round(
                performance.now() - startTime
            );

            const message = response.data.message || 'No message';

            updateClient(
                id,
                response.success ? 'Completed' : 'Rejected',
                response.httpCode,
                `${duration} ms`,
                message
            );

            return {
                id,
                success: response.success,
                httpCode: response.httpCode,
                duration,
                message
            };

        } catch (error) {

            const duration = Math.round(
                performance.now() - startTime
            );

            updateClient(
                id,
                'Error',
                'Network Error',
                `${duration} ms`,
                error.message
            );

            return {
                id,
                success: false,
                httpCode: 0,
                duration,
                message: error.message
            };
        }
    }

    // --------------------------------------------------
    // Run the experiment
    // --------------------------------------------------

    async function startExperiment() {

        if (running) return;

        const count = Number(clientCountInput.value);

        if (!Number.isInteger(count) || count < 2 || count > 50) {

            statusEl.textContent =
                'Enter a client number between 2 and 50.';

            statusEl.style.color = '#dc2626';
            return;
        }

        running = true;

        startButton.disabled = true;
        resetButton.disabled = true;

        startButton.textContent = 'Experiment Running...';

        resetDashboard();
        createClientRows(count);

        totalClientsEl.textContent = count;

        statusEl.textContent = 'Resetting shared server resource...';
        statusEl.style.color = '#2563eb';

        try {

            // STEP 1: Reset the shared resource on PHP
            const resetResponse = await sendRequest('reset');

            if (!resetResponse.success) {

                throw new Error(
                    resetResponse.data.message ||
                    `Server reset failed (HTTP ${resetResponse.httpCode})`
                );
            }

            statusEl.textContent =
                'Launching real HTTP clients simultaneously...';

            // STEP 2: Launch clients concurrently
            const results = await Promise.allSettled(
                Array.from(
                    { length: count },
                    (_, index) => runClient(index + 1)
                )
            );

            const completed = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);

            const successful = completed.filter(
                result => result.success
            ).length;

            const failed = count - successful;

            successfulEl.textContent = successful;
            failedEl.textContent = failed;

            const winner = completed.find(
                result => result.success
            );

            statusEl.textContent =
                `Experiment completed. ${successful} resource winner(s), ` +
                `${failed} rejected/error requests. ` +
                (winner ? `Winner: Client ${winner.id}.` : '');

            statusEl.style.color = '#15803d';

        } catch (error) {

            console.error('Concurrency lab error:', error);

            statusEl.textContent =
                error.message || 'Experiment failed.';

            statusEl.style.color = '#dc2626';

        } finally {

            running = false;

            startButton.disabled = false;
            resetButton.disabled = false;

            startButton.textContent = 'Start Experiment';

            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    // --------------------------------------------------
    // Event listeners
    // --------------------------------------------------

    startButton.addEventListener('click', startExperiment);

    resetButton.addEventListener('click', () => {

        if (running) return;

        resetDashboard();
    });

    // Initial dashboard
    resetDashboard();

});
