import Cocoa

class NavigationBarView: NSView {

    var onNavigate: ((String) -> Void)?
    var onBack: (() -> Void)?
    var onForward: (() -> Void)?
    var onReload: (() -> Void)?
    var onHome: (() -> Void)?
    var onQuickLink: ((String) -> Void)?

    var quickLinks: [(title: String, url: String)] = [] {
        didSet { setupQuickLinks() }
    }

    private let backButton = NSButton()
    private let forwardButton = NSButton()
    private let reloadButton = NSButton()
    private let urlField = NSTextField()
    private let homeButton = NSButton()
    private var quickLinkButtons: [NSButton] = []

    // Quick links bar
    private let quickLinksBar = NSView()
    private var quickLinksBarHeightConstraint: NSLayoutConstraint?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        wantsLayer = true
        layer?.backgroundColor = NSColor(red: 0.117, green: 0.117, blue: 0.117, alpha: 1.0).cgColor

        // Navigation buttons
        backButton.title = "◀"
        backButton.bezelStyle = .smallSquare
        backButton.isBordered = false
        backButton.font = NSFont.systemFont(ofSize: 13)
        backButton.target = self
        backButton.action = #selector(backClicked)
        backButton.translatesAutoresizingMaskIntoConstraints = false

        forwardButton.title = "▶"
        forwardButton.bezelStyle = .smallSquare
        forwardButton.isBordered = false
        forwardButton.font = NSFont.systemFont(ofSize: 13)
        forwardButton.target = self
        forwardButton.action = #selector(forwardClicked)
        forwardButton.translatesAutoresizingMaskIntoConstraints = false

        reloadButton.title = "↻"
        reloadButton.bezelStyle = .smallSquare
        reloadButton.isBordered = false
        reloadButton.font = NSFont.systemFont(ofSize: 15)
        reloadButton.target = self
        reloadButton.action = #selector(reloadClicked)
        reloadButton.translatesAutoresizingMaskIntoConstraints = false

        // URL field
        urlField.translatesAutoresizingMaskIntoConstraints = false
        urlField.placeholderString = "Search or enter URL"
        urlField.font = NSFont(name: "SF Mono", size: 12) ?? NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        urlField.focusRingType = .none
        urlField.isBordered = false
        urlField.isEditable = true
        urlField.delegate = self
        urlField.lineBreakMode = .byClipping
        urlField.maximumNumberOfLines = 1

        // URL field background
        let urlContainer = NSView()
        urlContainer.translatesAutoresizingMaskIntoConstraints = false
        urlContainer.wantsLayer = true
        urlContainer.layer?.backgroundColor = NSColor(red: 0.165, green: 0.165, blue: 0.165, alpha: 1.0).cgColor
        urlContainer.layer?.cornerRadius = 5
        urlContainer.addSubview(urlField)

        // Home button
        homeButton.title = "⌂"
        homeButton.bezelStyle = .smallSquare
        homeButton.isBordered = false
        homeButton.font = NSFont.systemFont(ofSize: 14)
        homeButton.target = self
        homeButton.action = #selector(homeClicked)
        homeButton.translatesAutoresizingMaskIntoConstraints = false

        // Add to nav bar
        addSubview(backButton)
        addSubview(forwardButton)
        addSubview(reloadButton)
        addSubview(urlContainer)
        addSubview(homeButton)

        // Quick links bar
        quickLinksBar.translatesAutoresizingMaskIntoConstraints = false
        quickLinksBar.wantsLayer = true
        quickLinksBar.layer?.backgroundColor = NSColor(red: 0.086, green: 0.086, blue: 0.086, alpha: 1.0).cgColor
        addSubview(quickLinksBar)

        // Layout
        NSLayoutConstraint.activate([
            // Nav bar buttons
            backButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            backButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            backButton.widthAnchor.constraint(equalToConstant: 28),

            forwardButton.leadingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: 2),
            forwardButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            forwardButton.widthAnchor.constraint(equalToConstant: 28),

            reloadButton.leadingAnchor.constraint(equalTo: forwardButton.trailingAnchor, constant: 2),
            reloadButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            reloadButton.widthAnchor.constraint(equalToConstant: 28),

            // URL container
            urlContainer.leadingAnchor.constraint(equalTo: reloadButton.trailingAnchor, constant: 8),
            urlContainer.trailingAnchor.constraint(equalTo: homeButton.leadingAnchor, constant: -8),
            urlContainer.centerYAnchor.constraint(equalTo: centerYAnchor),
            urlContainer.heightAnchor.constraint(equalToConstant: 26),

            urlField.leadingAnchor.constraint(equalTo: urlContainer.leadingAnchor, constant: 8),
            urlField.trailingAnchor.constraint(equalTo: urlContainer.trailingAnchor, constant: -8),
            urlField.centerYAnchor.constraint(equalTo: urlContainer.centerYAnchor),

            // Home button
            homeButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            homeButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            homeButton.widthAnchor.constraint(equalToConstant: 28),

            // Quick links bar
            quickLinksBar.leadingAnchor.constraint(equalTo: leadingAnchor),
            quickLinksBar.trailingAnchor.constraint(equalTo: trailingAnchor),
            quickLinksBar.bottomAnchor.constraint(equalTo: bottomAnchor),
            quickLinksBar.heightAnchor.constraint(equalToConstant: 24),
        ])

        setupQuickLinks()
    }

    private func setupQuickLinks() {
        // Remove old buttons
        for btn in quickLinkButtons {
            btn.removeFromSuperview()
        }
        quickLinkButtons.removeAll()

        var previousView: NSView = quickLinksBar
        var leadingConstant: CGFloat = 8

        for link in quickLinks {
            let btn = NSButton(title: link.title, target: self, action: #selector(quickLinkClicked(_:)))
            btn.bezelStyle = .smallSquare
            btn.isBordered = false
            btn.font = NSFont.systemFont(ofSize: 10)
            btn.contentTintColor = NSColor(red: 0.467, green: 0.467, blue: 0.467, alpha: 1.0)
            btn.tag = quickLinkButtons.count
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.wantsLayer = true
            btn.layer?.backgroundColor = NSColor(red: 0.133, green: 0.133, blue: 0.133, alpha: 1.0).cgColor
            btn.layer?.cornerRadius = 3

            quickLinksBar.addSubview(btn)

            NSLayoutConstraint.activate([
                btn.leadingAnchor.constraint(equalTo: previousView.leadingAnchor, constant: leadingConstant),
                btn.centerYAnchor.constraint(equalTo: quickLinksBar.centerYAnchor),
                btn.heightAnchor.constraint(equalToConstant: 18),
            ])

            leadingConstant = 4
            previousView = btn
            quickLinkButtons.append(btn)
        }
    }

    // MARK: - Actions

    @objc private func backClicked() { onBack?() }
    @objc private func forwardClicked() { onForward?() }
    @objc private func reloadClicked() { onReload?() }
    @objc private func homeClicked() { onHome?() }

    @objc private func quickLinkClicked(_ sender: NSButton) {
        let index = sender.tag
        guard index < quickLinks.count else { return }
        onQuickLink?(quickLinks[index].url)
    }

    // MARK: - Public

    func focusURLBar() {
        window?.makeFirstResponder(urlField)
        urlField.selectText(nil)
    }

    func update(url: String, canGoBack: Bool, canGoForward: Bool) {
        if urlField.stringValue != url {
            urlField.stringValue = url
        }
        backButton.isEnabled = canGoBack
        forwardButton.isEnabled = canGoForward
        backButton.alphaValue = canGoBack ? 1.0 : 0.3
        forwardButton.alphaValue = canGoForward ? 1.0 : 0.3
    }

    func setLoading(_ loading: Bool) {
        reloadButton.title = loading ? "✕" : "↻"
        if loading {
            reloadButton.action = #selector(stopClicked)
        } else {
            reloadButton.action = #selector(reloadClicked)
        }
    }

    @objc private func stopClicked() {
        // This would need access to the webview, delegate it up
        onReload?()
    }
}

// MARK: - NSTextFieldDelegate

extension NavigationBarView: NSTextFieldDelegate {
    func controlTextDidChange(_ obj: Notification) {
        // Live suggestions could go here
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) {
            let text = urlField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                onNavigate?(text)
            }
            window?.makeFirstResponder(nil)
            return true
        }
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
            window?.makeFirstResponder(nil)
            return true
        }
        return false
    }
}
