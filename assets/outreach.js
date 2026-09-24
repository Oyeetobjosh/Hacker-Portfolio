(() => {
    'use strict';

    const STORAGE_KEY = 'tobjosh-signaldesk-v1';
    const GOAL_USD = 777;
    const GOAL_NGN = 1000000;
    const STATUS_ORDER = ['saved', 'sent', 'replied', 'proposal', 'won'];

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

    const defaultState = {
        leads: [],
        stats: { replies: 0, proposals: 0, revenue: 0 },
        activeLeadId: null,
        timerRound: 1
    };

    let state = loadState();
    let activeTemplate = 'initial';
    let draftWasEdited = false;
    let toastTimer;

    const form = $('#lead-form');
    const companyInput = $('#company');
    const contactInput = $('#contact');
    const industryInput = $('#industry');
    const launchDateInput = $('#launch-date');
    const channelInput = $('#channel');
    const profileUrlInput = $('#profile-url');
    const websiteInput = $('#website');
    const signalInput = $('#signal');
    const observationInput = $('#observation');
    const draftInput = $('#message-draft');

    function loadState() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            return stored ? {
                ...defaultState,
                ...stored,
                stats: { ...defaultState.stats, ...(stored.stats || {}) },
                leads: Array.isArray(stored.leads) ? stored.leads : []
            } : structuredCloneSafe(defaultState);
        } catch (_) {
            return structuredCloneSafe(defaultState);
        }
    }

    function structuredCloneSafe(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {
            showToast('Could not save in this browser');
        }
    }

    function clean(value) {
        return String(value || '').trim();
    }

    function sentence(value) {
        const output = clean(value);
        if (!output) return '';
        return /[.!?]$/.test(output) ? output : `${output}.`;
    }

    function lowerFirst(value) {
        const output = clean(value);
        return output ? output.charAt(0).toLowerCase() + output.slice(1) : '';
    }

    function formData() {
        return {
            company: clean(companyInput.value),
            contact: clean(contactInput.value),
            industry: clean(industryInput.value),
            launchDate: launchDateInput.value,
            channel: channelInput.value,
            profileUrl: clean(profileUrlInput.value),
            website: clean(websiteInput.value),
            signal: clean(signalInput.value),
            observation: clean(observationInput.value),
            hasLiveProduct: $('#has-live-product').checked,
            hasSensitiveFlow: $('#has-sensitive-flow').checked,
            isRecent: $('#is-recent').checked
        };
    }

    function draftFor(template, data) {
        const company = data.company || '[Company]';
        const greeting = data.contact ? `Hi ${data.contact}` : `Hi ${company} team`;
        const signal = data.signal ? `I saw your update that ${lowerFirst(data.signal).replace(/[.!?]+$/, '')}.` : `I came across your recent launch.`;
        const observation = data.observation ? sentence(data.observation) : 'Your new product has customer-facing web flows worth protecting early.';

        if (template === 'linkedin') {
            return `${greeting} — congratulations on ${company}'s launch. ${signal}\n\nI’m Tobjosh, a penetration tester. ${observation}\n\nI run a focused, authorized launch-security sprint: hands-on testing of one web app and its documented API, a prioritized remediation report, a 30-minute debrief, and one retest — flat $777. Testing only starts after scope and written approval.\n\nWould it be helpful if I sent the one-page scope?`;
        }

        if (template === 'followup') {
            return `${greeting} — one quick follow-up on my note about ${company}. The $777 launch-security sprint covers authorized testing of one web app and its documented API, a prioritized fix report, a debrief, and one retest. If security is not a priority right now, no problem — I won’t keep nudging. Should I send the one-page scope?`;
        }

        return `${greeting} — congrats on ${company}'s launch. ${signal} I’m Tobjosh, a penetration tester. ${observation} I offer a focused, authorized launch-security sprint: web/API testing, a prioritized fix report, a 30-minute debrief, and one retest — flat $777. No surprise scanning; testing starts only after written approval. Open to a one-page scope?`;
    }

    function updateDraft(force = false) {
        if (draftWasEdited && !force) return;
        draftInput.value = draftFor(activeTemplate, formData());
        draftWasEdited = false;
        updateDraftMeta();
        $('#draft-state').textContent = 'READY';
        $('#draft-state').classList.remove('changed');
    }

    function updateDraftMeta() {
        $('#char-count').textContent = `${draftInput.value.length} characters`;
        const labels = { initial: `${channelInput.value.toUpperCase()} NOTE`, linkedin: 'LINKEDIN MESSAGE', followup: 'FOLLOW-UP' };
        $('#message-channel').textContent = labels[activeTemplate];
    }

    function calculateFit() {
        const data = formData();
        let score = 0;
        if (data.company) score += 1;
        if (data.signal && data.observation) score += 1;
        if (data.website || data.profileUrl) score += 1;
        if (data.isRecent || dateIsRecent(data.launchDate)) score += 1;
        if (data.hasLiveProduct && data.hasSensitiveFlow) score += 1;
        $('#fit-score').textContent = String(score);
    }

    function dateIsRecent(dateString) {
        if (!dateString) return false;
        const date = new Date(`${dateString}T12:00:00`);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return date >= sixMonthsAgo && date <= new Date();
    }

    function createId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function saveCurrentLead(options = {}) {
        const data = formData();
        if (!data.company || !data.signal || !data.observation) {
            if (!options.silent) showToast('Add company, signal, and observation first', false);
            return null;
        }

        const now = new Date().toISOString();
        const existingIndex = state.leads.findIndex(lead => lead.id === state.activeLeadId);
        let lead;

        if (existingIndex >= 0) {
            lead = { ...state.leads[existingIndex], ...data, updatedAt: now, draft: draftInput.value };
            state.leads[existingIndex] = lead;
        } else {
            lead = { id: createId(), ...data, status: 'saved', createdAt: now, updatedAt: now, draft: draftInput.value };
            state.leads.unshift(lead);
            state.activeLeadId = lead.id;
        }

        saveState();
        renderAll();
        if (!options.silent) showToast(existingIndex >= 0 ? 'Lead updated' : 'Lead saved to queue');
        return lead;
    }

    function setStatus(leadId, nextStatus) {
        const lead = state.leads.find(item => item.id === leadId);
        if (!lead || !STATUS_ORDER.includes(nextStatus)) return;

        const previousRank = STATUS_ORDER.indexOf(lead.status);
        const nextRank = STATUS_ORDER.indexOf(nextStatus);
        if (nextRank > previousRank) {
            if (nextStatus === 'replied') state.stats.replies += 1;
            if (nextStatus === 'proposal') state.stats.proposals += 1;
        }
        lead.status = nextStatus;
        lead.updatedAt = new Date().toISOString();
        saveState();
        renderAll();
    }

    function loadLead(leadId) {
        const lead = state.leads.find(item => item.id === leadId);
        if (!lead) return;
        state.activeLeadId = lead.id;
        companyInput.value = lead.company || '';
        contactInput.value = lead.contact || '';
        industryInput.value = lead.industry || '';
        launchDateInput.value = lead.launchDate || '';
        channelInput.value = lead.channel || 'Instagram';
        profileUrlInput.value = lead.profileUrl || '';
        websiteInput.value = lead.website || '';
        signalInput.value = lead.signal || '';
        observationInput.value = lead.observation || '';
        $('#has-live-product').checked = Boolean(lead.hasLiveProduct);
        $('#has-sensitive-flow').checked = Boolean(lead.hasSensitiveFlow);
        $('#is-recent').checked = Boolean(lead.isRecent);
        draftWasEdited = false;
        updateDraft(true);
        if (lead.draft) {
            draftInput.value = lead.draft;
            updateDraftMeta();
        }
        calculateFit();
        saveState();
        $('.lead-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`${lead.company} loaded`);
    }

    function sentCount() {
        return state.leads.filter(lead => STATUS_ORDER.indexOf(lead.status) >= STATUS_ORDER.indexOf('sent')).length;
    }

    function renderStats() {
        const usd = Math.max(0, Number(state.stats.revenue) || 0);
        const ngn = Math.round((usd / GOAL_USD) * GOAL_NGN);
        const progress = Math.min(100, (usd / GOAL_USD) * 100);
        $('#goal-usd').textContent = `$${usd.toLocaleString()}`;
        $('#goal-naira').textContent = `₦${ngn.toLocaleString()}`;
        $('#goal-progress').style.width = `${progress}%`;
        $('#sent-count').textContent = String(sentCount());
        $('#reply-count').textContent = String(state.stats.replies || 0);
        $('#proposal-count').textContent = String(state.stats.proposals || 0);
    }

    function renderLeads() {
        const tbody = $('#lead-list');
        const query = clean($('#lead-filter').value).toLowerCase();
        const leads = state.leads.filter(lead => [lead.company, lead.signal, lead.channel, lead.status].join(' ').toLowerCase().includes(query));
        tbody.replaceChildren();

        leads.forEach(lead => {
            const row = document.createElement('tr');
            const actionLabel = {
                saved: 'Open draft',
                sent: 'Mark replied',
                replied: 'Mark scope sent',
                proposal: 'Mark won',
                won: 'Complete'
            }[lead.status] || 'Open';
            const nextAction = {
                saved: 'Personalize + send',
                sent: 'Wait, then follow up',
                replied: 'Send one-page scope',
                proposal: 'Confirm authorization',
                won: 'Schedule kickoff'
            }[lead.status] || 'Review';

            row.innerHTML = `
                <td><strong></strong><small></small></td>
                <td class="signal-cell"></td>
                <td class="channel-cell"></td>
                <td><span class="status-pill"></span></td>
                <td><strong class="next-action"></strong><small class="updated-at"></small></td>
                <td><button class="row-action" type="button"></button> <button class="row-menu" type="button" aria-label="Delete lead">×</button></td>`;
            const firstCell = row.cells[0];
            $('strong', firstCell).textContent = lead.company;
            $('small', firstCell).textContent = lead.industry || 'Uncategorized';
            $('.signal-cell', row).textContent = truncate(lead.signal, 58);
            $('.channel-cell', row).textContent = lead.channel;
            const pill = $('.status-pill', row);
            pill.textContent = lead.status;
            pill.classList.add(lead.status);
            $('.next-action', row).textContent = nextAction;
            $('.updated-at', row).textContent = relativeDate(lead.updatedAt);
            const action = $('.row-action', row);
            action.textContent = actionLabel;
            action.addEventListener('click', () => handleLeadAction(lead));
            $('.row-menu', row).addEventListener('click', () => deleteLead(lead.id));
            tbody.appendChild(row);
        });

        $('#empty-state').hidden = state.leads.length > 0;
        $('table').hidden = state.leads.length === 0;
    }

    function truncate(value, max) {
        const output = clean(value);
        return output.length > max ? `${output.slice(0, max - 1)}…` : output;
    }

    function relativeDate(iso) {
        if (!iso) return 'Not updated';
        const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
        if (minutes < 1) return 'Updated just now';
        if (minutes < 60) return `Updated ${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Updated ${hours}h ago`;
        return `Updated ${Math.floor(hours / 24)}d ago`;
    }

    function handleLeadAction(lead) {
        if (lead.status === 'saved') return loadLead(lead.id);
        if (lead.status === 'sent') {
            setStatus(lead.id, 'replied');
            return showToast('Reply logged');
        }
        if (lead.status === 'replied') {
            setStatus(lead.id, 'proposal');
            return showToast('Scope marked as sent');
        }
        if (lead.status === 'proposal') {
            setStatus(lead.id, 'won');
            state.stats.revenue += GOAL_USD;
            saveState();
            renderAll();
            return showToast('Engagement won — great work');
        }
        loadLead(lead.id);
    }

    function deleteLead(leadId) {
        const lead = state.leads.find(item => item.id === leadId);
        if (!lead || !window.confirm(`Remove ${lead.company} from your local queue?`)) return;
        state.leads = state.leads.filter(item => item.id !== leadId);
        if (state.activeLeadId === leadId) state.activeLeadId = null;
        saveState();
        renderAll();
        showToast('Lead removed');
    }

    function renderAll() {
        renderStats();
        renderLeads();
        $('#round-counter').textContent = `${String(state.timerRound || 1).padStart(2, '0')} / 04`;
    }

    function showToast(message, success = true) {
        const toast = $('#toast');
        $('span', toast).textContent = success ? '✓' : '!';
        $('p', toast).textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }

    async function copyText(text, successMessage) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.style.position = 'fixed';
            helper.style.opacity = '0';
            document.body.appendChild(helper);
            helper.select();
            document.execCommand('copy');
            helper.remove();
        }
        showToast(successMessage);
    }

    function safeUrl(value) {
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch (_) {
            return null;
        }
    }

    // Discovery opens a normal platform search. It never scrapes or sends anything.
    $$('[data-search-channel]').forEach(button => {
        button.addEventListener('click', () => {
            const query = clean($('#discovery-query').value);
            if (!query) return showToast('Add a search phrase first', false);
            const encoded = encodeURIComponent(query);
            const destinations = {
                instagram: `https://www.instagram.com/explore/search/keyword/?q=${encoded}`,
                linkedin: `https://www.linkedin.com/search/results/companies/?keywords=${encoded}`,
                web: `https://www.google.com/search?q=${encodeURIComponent(`${query} startup launch`)}`
            };
            window.open(destinations[button.dataset.searchChannel], '_blank', 'noopener,noreferrer');
        });
    });

    $$('[data-query]').forEach(button => {
        button.addEventListener('click', () => {
            $('#discovery-query').value = button.dataset.query;
            $('#discovery-query').focus();
        });
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        saveCurrentLead();
    });

    [...form.elements].forEach(element => {
        element.addEventListener('input', () => {
            calculateFit();
            updateDraft();
        });
        element.addEventListener('change', () => {
            calculateFit();
            updateDraft();
        });
    });

    $$('.template-tab').forEach(button => {
        button.addEventListener('click', () => {
            $$('.template-tab').forEach(tab => tab.classList.toggle('active', tab === button));
            activeTemplate = button.dataset.template;
            draftWasEdited = false;
            updateDraft(true);
        });
    });

    draftInput.addEventListener('input', () => {
        draftWasEdited = true;
        updateDraftMeta();
        $('#draft-state').textContent = 'EDITED';
        $('#draft-state').classList.add('changed');
    });

    $('#copy-draft').addEventListener('click', () => {
        if (!clean(draftInput.value)) return showToast('There is no draft to copy', false);
        copyText(draftInput.value, 'Draft copied — review before sending');
    });

    $('#open-profile').addEventListener('click', () => {
        const url = safeUrl(profileUrlInput.value);
        if (!url) return showToast('Add a valid profile URL first', false);
        window.open(url, '_blank', 'noopener,noreferrer');
    });

    $('#mark-sent').addEventListener('click', () => {
        let lead = state.leads.find(item => item.id === state.activeLeadId);
        if (!lead) lead = saveCurrentLead({ silent: true });
        if (!lead) return showToast('Save a qualified lead before marking sent', false);
        const currentRank = STATUS_ORDER.indexOf(lead.status);
        if (currentRank >= STATUS_ORDER.indexOf('sent')) return showToast('This lead is already marked sent');
        lead.draft = draftInput.value;
        setStatus(lead.id, 'sent');
        showToast('Manual send logged');
    });

    $('#lead-filter').addEventListener('input', renderLeads);

    $('#clear-data').addEventListener('click', () => {
        if (!state.leads.length) return;
        if (!window.confirm('Clear every lead and result from this browser?')) return;
        state = structuredCloneSafe(defaultState);
        saveState();
        form.reset();
        channelInput.value = 'Instagram';
        draftWasEdited = false;
        updateDraft(true);
        calculateFit();
        renderAll();
        showToast('Local workspace cleared');
    });

    $('#load-example').addEventListener('click', () => {
        companyInput.value = 'Northstar Labs';
        contactInput.value = 'Ada';
        industryInput.value = 'SaaS';
        channelInput.value = 'Instagram';
        signalInput.value = 'announced the public beta of its team workspace last week';
        observationInput.value = 'The product now supports team invitations, account roles, and file uploads';
        websiteInput.value = 'https://example.com';
        const launch = new Date();
        launch.setDate(launch.getDate() - 21);
        launchDateInput.value = launch.toISOString().slice(0, 10);
        $('#has-live-product').checked = true;
        $('#has-sensitive-flow').checked = true;
        $('#is-recent').checked = true;
        draftWasEdited = false;
        updateDraft(true);
        calculateFit();
        showToast('Private example loaded — edit before saving');
        $('.lead-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#copy-scope').addEventListener('click', () => {
        const scope = `LAUNCH SECURITY SPRINT — $777 FLAT\n\nAuthorized scope\n• One production or staging web application\n• Documented first-party API endpoints\n• Authentication, access control, session, input handling, and key business-logic checks\n\nDeliverables\n• Prioritized findings with evidence and practical remediation guidance\n• 30-minute findings debrief\n• One retest of reported fixes within 14 days\n\nProcess\nTesting begins only after written authorization, agreed scope, test accounts, dates, and emergency contacts are confirmed. No denial-of-service, social engineering, destructive testing, or third-party infrastructure. Critical findings are escalated immediately.\n\nTimeline: confirm after scoping, typically 3–5 business days.\nPayment: $777 flat for the scope above; expansion is quoted separately.`;
        copyText(scope, 'Sprint scope copied');
    });

    $('#export-button').addEventListener('click', () => {
        const exportData = { exportedAt: new Date().toISOString(), ...state };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `signaldesk-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        showToast('Local data exported');
    });

    // Result modal
    const modal = $('#result-modal');
    $('#log-win-button').addEventListener('click', () => {
        modal.hidden = false;
        $('#result-type').focus();
    });
    $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => { modal.hidden = true; }));
    modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.hidden = true; });
    $('#result-type').addEventListener('change', () => {
        $('#amount-field').classList.toggle('hidden', $('#result-type').value !== 'win');
    });
    $('#result-form').addEventListener('submit', event => {
        event.preventDefault();
        const type = $('#result-type').value;
        if (type === 'reply') state.stats.replies += 1;
        if (type === 'proposal') state.stats.proposals += 1;
        if (type === 'win') state.stats.revenue += Math.max(0, Number($('#result-amount').value) || 0);
        saveState();
        renderStats();
        modal.hidden = true;
        showToast(type === 'win' ? 'Signed value added' : 'Result logged');
    });

    // Focus timer: deliberate work sessions and explicit breaks, not simulated activity.
    const timer = {
        mode: 'focus',
        remaining: 25 * 60,
        running: false,
        interval: null
    };

    function renderTimer() {
        const minutes = Math.floor(timer.remaining / 60);
        const seconds = timer.remaining % 60;
        $('#timer-display').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        $('#timer-start').innerHTML = timer.running ? '<span>Ⅱ</span> Pause session' : '<span>▶</span> Start session';
        document.title = timer.running ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} · SignalDesk` : 'SignalDesk | Tobjosh Outreach Workspace';
    }

    function setTimerMode(mode) {
        timer.mode = mode;
        timer.running = false;
        clearInterval(timer.interval);
        timer.remaining = mode === 'focus' ? 25 * 60 : 5 * 60;
        $$('.mode-button').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
        renderTimer();
    }

    $$('.mode-button').forEach(button => button.addEventListener('click', () => setTimerMode(button.dataset.mode)));
    $('#timer-start').addEventListener('click', () => {
        timer.running = !timer.running;
        clearInterval(timer.interval);
        if (timer.running) {
            timer.interval = setInterval(() => {
                timer.remaining -= 1;
                if (timer.remaining <= 0) {
                    clearInterval(timer.interval);
                    timer.running = false;
                    if (timer.mode === 'focus') {
                        state.timerRound = state.timerRound >= 4 ? 1 : state.timerRound + 1;
                        saveState();
                        showToast('Focus complete — take the break');
                        setTimerMode('break');
                        renderAll();
                    } else {
                        showToast('Break complete — ready when you are');
                        setTimerMode('focus');
                    }
                }
                renderTimer();
            }, 1000);
        }
        renderTimer();
    });
    $('#timer-reset').addEventListener('click', () => setTimerMode(timer.mode));

    // Initial page setup
    const today = new Intl.DateTimeFormat('en', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date()).toUpperCase();
    $('#today-label').textContent = today;
    launchDateInput.max = new Date().toISOString().slice(0, 10);
    updateDraft(true);
    calculateFit();
    renderAll();
    renderTimer();
})();
