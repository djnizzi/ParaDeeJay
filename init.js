// ParaDeeJay - toolbar button and playback listener.
// Actions, hotkeys, the Tools menu and the runtime live in actions_add.js.
requirejs('actions');

(function () {
    'use strict';

    var toolbarIcon = null;

    function setCheckedState(el, checked) {
        if (!el) return;
        if (checked) el.setAttribute('data-checked', '1');
        else el.removeAttribute('data-checked');
    }

    function updateToolbarState() {
        if (!toolbarIcon || !window.ParaDeeJay) return;

        var settings = window.ParaDeeJay.read();
        var tip = window.ParaDeeJay.statusText();
        var button = toolbarIcon.querySelector('.toolButton') || toolbarIcon;

        button.classList.add('checkable');
        setCheckedState(toolbarIcon, settings.enabled);
        setCheckedState(button, settings.enabled);
        button.style.opacity = settings.enabled ? '1' : '0.45';

        toolbarIcon.setAttribute('data-tip', tip);
        toolbarIcon.setAttribute('data-aria-label', tip);

        var svg = toolbarIcon.querySelector('svg');
        if (svg) svg.setAttribute('aria-label', tip);
    }

    function removeToolbarButton() {
        if (!toolbarIcon) return;
        if (toolbarIcon.parentNode) toolbarIcon.parentNode.removeChild(toolbarIcon);
        toolbarIcon = null;
    }

    // Called by actions_add.js whenever the settings change.
    window.ParaDeeJayRefreshToolbar = function () {
        if (!window.ParaDeeJay) return;

        var settings = window.ParaDeeJay.read();

        if (!settings.showToolbarButton) {
            removeToolbarButton();
            return;
        }

        if (!toolbarIcon) {
            toolbarIcon = window.uitools.addToolButton('righttoolbuttons', 'para-deejay', function () {
                actions.paraDeeJay_toggle.execute();
            }, window.ParaDeeJay.statusText());

            toolbarIcon.controlClass.contextMenu = new Menu([
                { action: actions.paraDeeJay_toggle, order: 10, grouporder: 10 },
                { action: actions.paraDeeJay_speakCurrent, order: 20, grouporder: 20 },
                { action: actions.paraDeeJay_testVoice, order: 10, grouporder: 30 },
                { action: actions.paraDeeJay_settings, order: 20, grouporder: 30 }
            ]);
        }

        updateToolbarState();
    };

    window.whenReady(function () {
        window.ParaDeeJayRefreshToolbar();

        // Announce on `play` only: at `trackChanged` the new track is not loaded
        // yet, while the `play` that follows always is.
        app.listen(app.player, 'playbackState', function (state) {
            if (state === 'play' && window.ParaDeeJay) {
                window.ParaDeeJay.onPlay();
            }
        });

        // Build the runtime in the background so the first announcement does not
        // pay the 1.5 s session-creation cost.
        window.requestTimeout(function () {
            var engine = window.ParaDeeJay && window.ParaDeeJay.engine();
            if (engine) engine.warm();
        }, 4000);
    });
})();
