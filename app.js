        // --- Spotify API endpoint constants ---
        const SPOTIFY_API = {
            CURRENTLY_PLAYING: 'https://api.spotify.com/v1/me/player/currently-playing',
            PLAYER:            'https://api.spotify.com/v1/me/player',
            TOKEN:             'https://accounts.spotify.com/api/token',
            ALBUM:             (id) => `https://api.spotify.com/v1/albums/${id}`,
            TRACKS_CONTAINS:   (id) => `https://api.spotify.com/v1/me/tracks/contains?ids=${id}`,
            TRACKS:            (id) => `https://api.spotify.com/v1/me/tracks?ids=${id}`,
        };

        const CLIENT_ID = '9b633913a2844cd5924c7e923f84325d';
        // Dynamic: works on localhost, GitHub Pages, Netlify, or any domain
        const REDIRECT_URI = window.location.origin + window.location.pathname;
        const SCOPE = 'user-read-currently-playing user-modify-playback-state user-library-read user-library-modify';

        const gear = document.getElementById('gear-icon');
        const panel = document.getElementById('ui-panel');
        const settings = document.getElementById('settings-container');
        const blackout = document.getElementById('blackout');
        const albumArt = document.getElementById('album-art');
        const credits = document.getElementById('credits');
        const controls = document.getElementById('playback-controls');
        const clockEl = document.getElementById('clock');
        const flashEl = document.getElementById('corner-flash');

        // --- Idle cursor / UI hide logic ---
        let idleTimer;
        function resetIdleTimer() {
            settings.classList.remove('ui-hidden');
            if (clockMode !== 2) clockEl.classList.remove('ui-hidden');
            if (controlsMode !== 2) controls.classList.remove('ui-hidden');
            if (creditsMode !== 2) credits.classList.remove('ui-hidden');
            document.body.classList.remove('idle-cursor');
            clearTimeout(idleTimer);
            if (panel.style.display !== 'flex') {
                idleTimer = setTimeout(() => {
                    settings.classList.add('ui-hidden');
                    if (clockMode === 1) clockEl.classList.add('ui-hidden');
                    if (controlsMode === 1) controls.classList.add('ui-hidden');
                    if (creditsMode === 1) credits.classList.add('ui-hidden');
                    document.body.classList.add('idle-cursor');
                }, 3000);
            }
        }
        window.onmousemove = resetIdleTimer;
        gear.onclick = () => { panel.style.display = (panel.style.display === 'flex') ? 'none' : 'flex'; resetIdleTimer(); };

        // --- Ken Burns / DVD Bounce state (unchanged) ---
        let isGameMode = false, state = "ZOOM_IN", zoomPhase = 0, zoomSpeed = 0.0003, targetDepth = 4.0;
        let holdCounter = 0, fadeLevel = 0, currentX = 50, currentY = 50;
        let bX = 50, bY = 50, bVelX = 1.5, bVelY = 1.5;

        // --- Playback / Like state ---
        let currentTrackId = null, currentAlbumId = null, isPlaying = false, isLiked = false;
        // --- Visibility modes: 0=ON, 1=FADE, 2=OFF ---
        let clockMode = 1, controlsMode = 1, creditsMode = 0;
        const MODES = ['ON', 'FADE', 'OFF'];
        let pkceVerifier = null, pkceChallenge = null;
        // Pre-generate PKCE on load so login click is fully synchronous (no async/await)
        if (!new URLSearchParams(window.location.search).get('code')) {
            generatePKCE().then(p => { pkceVerifier = p.verifier; pkceChallenge = p.challenge; localStorage.setItem('code_verifier', p.verifier); });
        }

        function getTrueRandomPoint(oldX, oldY) {
            let rx, ry, dist, attempts = 0;
            do {
                rx = Math.floor(Math.random() * 101);
                ry = Math.floor(Math.random() * 101);
                dist = Math.sqrt(Math.pow(rx - oldX, 2) + Math.pow(ry - oldY, 2));
                attempts++;
            } while (attempts < 50 && dist < 65);
            return { x: rx, y: ry };
        }

        const DVD_SIZE = 200; // px — fixed size of the image in DVD mode

        // --- Animation loop with visibility pause ---
        let animFrameId = null;
        function runAnimation() {
            if (isGameMode) {
                const maxX = window.innerWidth - DVD_SIZE;
                const maxY = window.innerHeight - DVD_SIZE;
                bX += bVelX; bY += bVelY;
                let hitX = false, hitY = false;
                if (bX >= maxX) { bX = maxX; bVelX = -Math.abs(bVelX); hitX = true; }
                else if (bX <= 0) { bX = 0; bVelX = Math.abs(bVelX); hitX = true; }
                if (bY >= maxY) { bY = maxY; bVelY = -Math.abs(bVelY); hitY = true; }
                else if (bY <= 0) { bY = 0; bVelY = Math.abs(bVelY); hitY = true; }
                if (hitX && hitY) { triggerCornerFlash(); }
                // GPU-composited: translate instead of left/top (no layout reflow)
                albumArt.style.transform = `translate(${bX}px, ${bY}px)`;
            } else {
                switch(state) {
                    case "ZOOM_IN":
                        zoomPhase += zoomSpeed;
                        if (zoomPhase >= 1) { zoomPhase = 1; state = "HOLD_PEAK"; holdCounter = 150; }
                        break;
                    case "HOLD_PEAK":
                        holdCounter--;
                        if (holdCounter <= 0) state = "FADE_OUT";
                        break;
                    case "FADE_OUT":
                        fadeLevel += 0.02;
                        if (fadeLevel >= 1) {
                            fadeLevel = 1;
                            const pt = getTrueRandomPoint(currentX, currentY);
                            currentX = pt.x; currentY = pt.y;
                            albumArt.style.transformOrigin = currentX + '% ' + currentY + '%';
                            state = "FADE_IN";
                        }
                        break;
                    case "FADE_IN":
                        fadeLevel -= 0.02;
                        if (fadeLevel <= 0) { fadeLevel = 0; state = "ZOOM_OUT"; }
                        break;
                    case "ZOOM_OUT":
                        zoomPhase -= zoomSpeed;
                        if (zoomPhase <= 0) { zoomPhase = 0; state = "HOLD_START"; holdCounter = 150; }
                        break;
                    case "HOLD_START":
                        holdCounter--;
                        if (holdCounter <= 0) {
                            const pt = getTrueRandomPoint(currentX, currentY);
                            currentX = pt.x; currentY = pt.y;
                            albumArt.style.transformOrigin = currentX + '% ' + currentY + '%';
                            state = "ZOOM_IN";
                        }
                        break;
                }
                // LINEAR CALCULATION Jerry: No easing, no ramping
                albumArt.style.transform = 'scale(' + (1 + (zoomPhase * (targetDepth - 1))) + ')';
            }
            blackout.style.opacity = fadeLevel;
            if (fadeLevel > 0 && creditsMode !== 2) credits.classList.remove('ui-hidden');
            animFrameId = requestAnimationFrame(runAnimation);
        }

        // Pause the rAF loop entirely when tab is hidden; resume when visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
            } else {
                if (animFrameId === null && localStorage.getItem('access_token')) { runAnimation(); }
            }
        });

        function triggerCornerFlash() {
            flashEl.style.transition = 'none';
            flashEl.style.opacity = '1';
            requestAnimationFrame(() => { requestAnimationFrame(() => { flashEl.style.transition = 'opacity 300ms'; flashEl.style.opacity = '0'; }); });
        }

        // --- PKCE helpers ---
        async function generatePKCE() {
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            const verifier = btoa(String.fromCharCode(...array))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const encoder = new TextEncoder();
            const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
            const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            return { verifier, challenge };
        }

        // --- Error banner ---
        let errorTimeout = null;
        function showError(message, persistent = false) {
            const banner = document.getElementById('error-banner');
            if (!banner) return;
            banner.textContent = typeof message === 'string' ? message : 'Connection error. Retrying...';
            banner.style.display = 'block';
            banner.style.opacity = '1';
            clearTimeout(errorTimeout);
            if (!persistent) {
                errorTimeout = setTimeout(() => {
                    banner.style.opacity = '0';
                    setTimeout(() => { banner.style.display = 'none'; }, 500);
                }, 5000);
            }
        }

        // --- Token refresh ---
        async function refreshAccessToken() {
            const refresh = localStorage.getItem('refresh_token');
            if (!refresh) return false;
            try {
                const res = await fetch(SPOTIFY_API.TOKEN, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refresh })
                });
                const data = await res.json();
                if (data.access_token) {
                    localStorage.setItem('access_token', data.access_token);
                    localStorage.setItem('token_expires_at', Date.now() + (data.expires_in * 1000));
                    if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
                    return true;
                }
            } catch (e) {
                console.error('[SpotifyPlayer] token refresh failed:', e);
            }
            return false;
        }

        // --- Proactive token expiry check: refreshes 60s before expiry ---
        async function getValidToken() {
            const expiresAt = parseInt(localStorage.getItem('token_expires_at') || '0');
            if (Date.now() > expiresAt - 60000) {
                await refreshAccessToken();
            }
            return localStorage.getItem('access_token');
        }

        // --- Visible reconnect state ---
        function showReconnectState() {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('token_expires_at');
            const btn = document.getElementById('login-btn');
            btn.textContent = 'Session expired \u2014 click to reconnect';
            btn.style.display = 'block';
        }

        // --- Like / Unlike ---
        async function checkLiked(trackId) {
            const token = await getValidToken();
            if (!token || !trackId) return;
            try {
                const r = await fetch(SPOTIFY_API.TRACKS_CONTAINS(trackId), {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (r.ok) {
                    const data = await r.json();
                    isLiked = data[0];
                    const lb = document.getElementById('like-btn');
                    lb.innerHTML = isLiked ? '&#9829;' : '&#9825;';
                    lb.classList.toggle('liked', isLiked);
                }
            } catch (e) {
                console.error('[SpotifyPlayer] checkLiked failed:', e);
            }
        }

        async function toggleLike() {
            const token = await getValidToken();
            if (!token || !currentTrackId) return;
            const method = isLiked ? 'DELETE' : 'PUT';
            try {
                await fetch(SPOTIFY_API.TRACKS(currentTrackId), {
                    method,
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
                isLiked = !isLiked;
                const lb = document.getElementById('like-btn');
                lb.innerHTML = isLiked ? '&#9829;' : '&#9825;';
                lb.classList.toggle('liked', isLiked);
            } catch (e) {
                console.error('[SpotifyPlayer] toggleLike failed:', e);
                showError('Failed to update like status.');
            }
        }

        // --- Playback commands ---
        async function playbackCommand(endpoint, method) {
            const token = await getValidToken();
            if (!token) return;
            try {
                await fetch(SPOTIFY_API.PLAYER + '/' + endpoint, {
                    method: method || 'POST',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
            } catch (e) {
                console.error('[SpotifyPlayer] playback command failed:', e);
                showError('Playback command failed.');
            }
        }

        function toTitleCase(str) { return str.replace(/\S+/g, w => { const letters = w.replace(/[^a-zA-Z]/g, ''); if (letters.length >= 2 && letters === letters.toUpperCase()) return w; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }); }

        // --- Album label fetch ---
        async function fetchAlbumLabel(albumId) {
            if (!albumId) { console.log('[label] no albumId'); return; }
            let token = await getValidToken();
            if (!token) { console.log('[label] no token'); return; }
            try {
                let r = await fetch(SPOTIFY_API.ALBUM(albumId) + '?market=from_token', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                console.log('[label] status:', r.status, 'albumId:', albumId);
                if (r.status === 401) {
                    const ok = await refreshAccessToken();
                    if (!ok) return;
                    token = localStorage.getItem('access_token');
                    r = await fetch(SPOTIFY_API.ALBUM(albumId) + '?market=from_token', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    console.log('[label] retry status:', r.status);
                }
                if (r.ok) {
                    const data = await r.json();
                    const year = data.release_date ? data.release_date.substring(0, 4) : '';
                    let label = data.label || '';
                    if (!label && data.copyrights && data.copyrights.length) {
                        const p = data.copyrights.find(c => c.type === 'P');
                        if (p) {
                            label = p.text
                                .replace(/\(P\)|\(C\)|[℗©]/g, '')
                                .replace(/^\s*(This\s+\w+\s+)*\d{4}\s*/i, '')
                                .replace(/,.*$/, '')
                                .replace(/\s+(Limited|Ltd\.?|LLC|Inc\.?|under\b|a\s+division\b).*/i, '')
                                .trim();
                        }
                    }
                    document.getElementById('label-line').innerText = label && year ? label + ' (' + year + ')' : label || year;
                } else {
                    console.log('[label] non-ok response:', r.status);
                }
            } catch (e) {
                console.error('[SpotifyPlayer] fetchAlbumLabel failed:', e);
            }
        }

        // --- Spotify polling ---
        // Dynamic delay: paused=10s, playing=tracks remaining time (3s min, 30s max)
        // 429 Too Many Requests: backs off per Retry-After header
        async function update() {
            const token = await getValidToken();
            if (!token) return;
            let delay = 2000;
            try {
                const r = await fetch(SPOTIFY_API.CURRENTLY_PLAYING, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (r.status === 401) {
                    const ok = await refreshAccessToken();
                    if (!ok) { showReconnectState(); return; }
                    delay = 1000;
                } else if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After') || '5');
                    setTimeout(update, retryAfter * 1000);
                    return;
                } else if (r.status === 403) {
                    showError('Spotify Premium required for this feature.');
                    delay = 10000;
                } else if (r.status === 404) {
                    showError('No active device found.');
                    delay = 5000;
                } else if (r.status === 204) {
                    document.getElementById('nothing-playing').style.display = 'block';
                    albumArt.style.display = 'none'; credits.style.display = 'none';
                    controls.style.display = 'none';
                    delay = 10000;
                } else if (r.status === 200) {
                    const d = await r.json();
                    if (!d.item) {
                        document.getElementById('nothing-playing').style.display = 'block';
                        albumArt.style.display = 'none'; credits.style.display = 'none';
                        controls.style.display = 'none';
                        delay = 10000;
                    } else {
                        document.getElementById('nothing-playing').style.display = 'none';
                        document.getElementById('login-btn').style.display = 'none';
                        albumArt.style.display = 'block'; credits.style.display = 'flex';
                        controls.style.display = 'flex'; clockEl.style.display = 'block';
                        if (albumArt.src !== d.item.album.images[0].url) {
                            albumArt.src = d.item.album.images[0].url;
                            document.getElementById('bg-blur').style.backgroundImage = 'url(' + d.item.album.images[0].url + ')';
                            state = "ZOOM_IN"; zoomPhase = 0; fadeLevel = 0; currentX = 50; currentY = 50;
                            albumArt.style.transformOrigin = "center center";
                            checkLiked(d.item.id);
                        }
                        if (d.item.album.id !== currentAlbumId) {
                            currentAlbumId = d.item.album.id;
                            fetchAlbumLabel(currentAlbumId);
                        }
                        currentTrackId = d.item.id;
                        isPlaying = d.is_playing;
                        document.getElementById('play-btn').innerHTML = isPlaying ? '&#9208;' : '&#9654;';
                        const prog = d.progress_ms, rem = d.item.duration_ms - prog;
                        if (prog < 15000 || rem < 15000) credits.classList.add('credits-focal');
                        else credits.classList.remove('credits-focal');
                        // DOM guards: only write if value changed
                        const artistEl = document.getElementById('artist-name');
                        const newArtist = toTitleCase(d.item.artists[0].name);
                        if (artistEl.innerText !== newArtist) artistEl.innerText = newArtist;

                        const songEl = document.getElementById('song-name');
                        const newSong = '"' + toTitleCase(d.item.name) + '"';
                        if (songEl.innerText !== newSong) songEl.innerText = newSong;

                        const albumEl = document.getElementById('album-name');
                        const newAlbum = toTitleCase(d.item.album.name);
                        if (albumEl.innerText !== newAlbum) albumEl.innerText = newAlbum;

                        delay = isPlaying
                            ? Math.min(Math.max(rem - 500, 3000), 30000)
                            : 10000;
                    }
                }
            } catch (e) {
                console.error('[SpotifyPlayer] fetch failed:', e);
                showError('Connection lost, retrying...');
                delay = 5000;
            }
            setTimeout(update, delay);
        }

        // --- Login button: full PKCE flow with CSRF state ---
        document.getElementById('login-btn').onclick = () => {
            if (!pkceChallenge) return;
            const csrfState = crypto.randomUUID();
            localStorage.setItem('oauth_state', csrfState);
            window.location.assign('https://accounts.spotify.com/authorize?client_id=' + CLIENT_ID +
                '&response_type=code&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
                '&scope=' + encodeURIComponent(SCOPE) +
                '&code_challenge_method=S256&code_challenge=' + pkceChallenge +
                '&state=' + csrfState);
        };

        // --- Bootstrap: handle OAuth callback and start app ---
        window.onload = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            if (code) {
                const returnedState = params.get('state');
                const storedState = localStorage.getItem('oauth_state');
                if (!returnedState || returnedState !== storedState) {
                    showError('Authentication failed: invalid state. Please try logging in again.', true);
                    document.getElementById('login-btn').textContent = 'Auth failed \u2014 click to try again';
                    document.getElementById('login-btn').style.display = 'block';
                    generatePKCE().then(p => { pkceVerifier = p.verifier; pkceChallenge = p.challenge; localStorage.setItem('code_verifier', p.verifier); });
                    return;
                }
                localStorage.removeItem('oauth_state');
                try {
                    const res = await fetch(SPOTIFY_API.TOKEN, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: localStorage.getItem('code_verifier') })
                    });
                    const data = await res.json();
                    if (data.access_token) {
                        localStorage.setItem('access_token', data.access_token);
                        localStorage.setItem('token_expires_at', Date.now() + (data.expires_in * 1000));
                        if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
                        window.history.replaceState({}, '', window.location.pathname);
                        generatePKCE().then(p => { pkceVerifier = p.verifier; pkceChallenge = p.challenge; localStorage.setItem('code_verifier', p.verifier); });
                    } else {
                        document.getElementById('login-btn').textContent = 'Auth failed \u2014 click to try again';
                        document.getElementById('login-btn').style.display = 'block';
                    }
                } catch (e) {
                    console.error('[SpotifyPlayer] auth callback failed:', e);
                    document.getElementById('login-btn').textContent = 'Auth failed \u2014 click to try again';
                    document.getElementById('login-btn').style.display = 'block';
                }
            }
            if (localStorage.getItem('access_token')) { update(); runAnimation(); }
        };

        // --- Clock ---
        function updateClock() {
            const now = new Date();
            const h = now.getHours(), m = now.getMinutes();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            clockEl.textContent = h12 + ':' + m.toString().padStart(2,'0') + ' ' + ampm;
        }
        updateClock();
        setInterval(updateClock, 10000);

        // --- Playback button handlers ---
        document.getElementById('prev-btn').onclick = () => playbackCommand('previous');
        document.getElementById('play-btn').onclick = () => playbackCommand(isPlaying ? 'pause' : 'play', 'PUT');
        document.getElementById('next-btn').onclick = () => playbackCommand('next');
        document.getElementById('like-btn').onclick = toggleLike;

        // --- Settings panel ---
        document.getElementById('game-toggle').onclick = (e) => {
            isGameMode = !isGameMode; e.target.innerText = isGameMode ? "Mode: DVD BOUNCE" : "Mode: ZOOM";
            const artContainer = document.getElementById('art-container');
            const bounceCtrl = document.getElementById('bounce-controls');
            const zoomCtrl = document.getElementById('zoom-controls');
            const cornerTestBtn = document.getElementById('corner-test-btn');
            if (isGameMode) {
                artContainer.style.display = 'block';
                albumArt.style.position = 'absolute';
                albumArt.style.left = '0';
                albumArt.style.top = '0';
                albumArt.style.width = DVD_SIZE + 'px';
                albumArt.style.height = DVD_SIZE + 'px';
                albumArt.style.maxWidth = 'none';
                albumArt.style.maxHeight = 'none';
                albumArt.style.transform = 'none';
                albumArt.style.willChange = 'transform';
                bX = 100; bY = 100;
                bounceCtrl.style.display = 'block'; zoomCtrl.style.display = 'none'; cornerTestBtn.style.display = 'block';
            } else {
                artContainer.style.display = 'flex';
                albumArt.style.position = 'relative';
                albumArt.style.left = 'auto';
                albumArt.style.top = 'auto';
                albumArt.style.width = '';
                albumArt.style.height = '';
                albumArt.style.maxWidth = '80%';
                albumArt.style.maxHeight = '80%';
                albumArt.style.willChange = '';
                albumArt.style.transform = '';
                bounceCtrl.style.display = 'none'; zoomCtrl.style.display = 'block'; cornerTestBtn.style.display = 'none';
            }
        };
        document.getElementById('zoom-range').oninput = (e) => targetDepth = parseFloat(e.target.value);
        document.getElementById('speed-range').oninput = (e) => {
            zoomSpeed = (parseFloat(e.target.value) / 100) * 0.0006;
        };
        document.getElementById('bounce-speed').oninput = (e) => { const s = parseFloat(e.target.value); bVelX = bVelX > 0 ? s : -s; bVelY = bVelY > 0 ? s : -s; };
        document.getElementById('logout-btn').onclick = () => { localStorage.clear(); location.reload(); };
        document.getElementById('fs-btn').onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
        function cycleMode(modeName, btnId) {
            if (modeName === 'clock') { clockMode = (clockMode + 1) % 3; document.getElementById(btnId).textContent = 'CLOCK: ' + MODES[clockMode]; if (clockMode === 2) clockEl.classList.add('vis-off'); else { clockEl.classList.remove('vis-off'); if (clockMode === 0) clockEl.classList.remove('ui-hidden'); } }
            if (modeName === 'controls') { controlsMode = (controlsMode + 1) % 3; document.getElementById(btnId).textContent = 'CONTROLS: ' + MODES[controlsMode]; if (controlsMode === 2) controls.classList.add('vis-off'); else { controls.classList.remove('vis-off'); if (controlsMode === 0) controls.classList.remove('ui-hidden'); } }
            if (modeName === 'credits') { creditsMode = (creditsMode + 1) % 3; document.getElementById(btnId).textContent = 'SONG INFO: ' + MODES[creditsMode]; if (creditsMode === 2) credits.classList.add('vis-off'); else { credits.classList.remove('vis-off'); if (creditsMode === 0) credits.classList.remove('ui-hidden'); } }
        }
        document.getElementById('clock-toggle').onclick = () => cycleMode('clock', 'clock-toggle');
        document.getElementById('controls-toggle').onclick = () => cycleMode('controls', 'controls-toggle');
        document.getElementById('credits-toggle').onclick = () => cycleMode('credits', 'credits-toggle');
        document.getElementById('corner-test-btn').onclick = () => { bX = 0; bY = 0; bVelX = -Math.abs(bVelX); bVelY = -Math.abs(bVelY); };
        document.getElementById('reset-btn').onclick = () => {
            targetDepth = 4.0; document.getElementById('zoom-range').value = 4.0;
            zoomSpeed = 0.0003; document.getElementById('speed-range').value = 50;
            const s = 1.5; bVelX = bVelX > 0 ? s : -s; bVelY = bVelY > 0 ? s : -s; document.getElementById('bounce-speed').value = 1.5;
        };
