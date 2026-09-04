import Cocoa

class TabBarView: NSView {

    var onTabSelected: ((Int) -> Void)?
    var onTabClose: ((Int) -> Void)?
    var onNewTab: (() -> Void)?

    private var tabButtons: [TabButton] = []
    private let scrollView = NSScrollView()
    private let stackView = NSStackView()
    private let newTabButton = NSButton()

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

        // Scroll view for tabs
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.hasHorizontalScroller = false
        scrollView.hasVerticalScroller = false
        scrollView.drawsBackground = false
        addSubview(scrollView)

        // Stack view inside scroll
        stackView.orientation = .horizontal
        stackView.spacing = 2
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.edgeInsets = NSEdgeInsets(top: 4, left: 6, bottom: 4, right: 6)
        scrollView.documentView = stackView

        // New tab button
        newTabButton.title = "+"
        newTabButton.bezelStyle = .smallSquare
        newTabButton.isBordered = false
        newTabButton.font = NSFont.systemFont(ofSize: 16, weight: .light)
        newTabButton.target = self
        newTabButton.action = #selector(newTabClicked)
        newTabButton.translatesAutoresizingMaskIntoConstraints = false
        newTabButton.setContentHuggingPriority(.required, for: .horizontal)
        stackView.addArrangedSubview(newTabButton)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),

            stackView.topAnchor.constraint(equalTo: scrollView.contentView.topAnchor),
            stackView.leadingAnchor.constraint(equalTo: scrollView.contentView.leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: scrollView.contentView.trailingAnchor),
            stackView.bottomAnchor.constraint(equalTo: scrollView.contentView.bottomAnchor),
            stackView.heightAnchor.constraint(equalTo: scrollView.contentView.heightAnchor),
        ])
    }

    func updateTabs(titles: [String], selectedIndex: Int) {
        // Remove old tab buttons
        for btn in tabButtons {
            stackView.removeArrangedSubview(btn)
            btn.removeFromSuperview()
        }
        tabButtons.removeAll()

        // Create new tab buttons
        for (index, title) in titles.enumerated() {
            let btn = TabButton(index: index, title: title)
            btn.isSelected = (index == selectedIndex)
            btn.onSelect = { [weak self] idx in self?.onTabSelected?(idx) }
            btn.onClose = { [weak self] idx in self?.onTabClose?(idx) }
            stackView.insertArrangedSubview(btn, at: index)
            tabButtons.append(btn)
        }
    }

    @objc private func newTabClicked() {
        onNewTab?()
    }
}

// MARK: - Close Button View (handles mouseDown directly, bypasses parent gesture recognizer)

class CloseButtonView: NSView {
    var onClick: (() -> Void)?

    override var acceptsFirstResponder: Bool { false }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil))
    }

    override func mouseDown(with event: NSEvent) {
        onClick?()
    }

    override func mouseEntered(with event: NSEvent) {
        NSCursor.pointingHand.push()
    }

    override func mouseExited(with event: NSEvent) {
        NSCursor.pop()
    }
}

// MARK: - Tab Button

class TabButton: NSView {

    var onSelect: ((Int) -> Void)?
    var onClose: ((Int) -> Void)?

    let index: Int
    private let titleLabel = NSTextField(labelWithString: "")
    private let closeView = CloseButtonView()

    var isSelected: Bool = false {
        didSet { updateAppearance() }
    }

    init(index: Int, title: String) {
        self.index = index
        super.init(frame: .zero)
        setupUI(title: title)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupUI(title: String) {
        wantsLayer = true
        layer?.cornerRadius = 5
        layer?.masksToBounds = true

        // Title
        titleLabel.stringValue = title
        titleLabel.font = NSFont.systemFont(ofSize: 11)
        titleLabel.textColor = NSColor(red: 0.6, green: 0.6, blue: 0.6, alpha: 1.0)
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.maximumNumberOfLines = 1
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(titleLabel)

        // Close button — use NSView + gesture to avoid parent gesture recognizer conflict
        closeView.wantsLayer = true
        closeView.layer?.cornerRadius = 3
        closeView.translatesAutoresizingMaskIntoConstraints = false

        let closeLabel = NSTextField(labelWithString: "×")
        closeLabel.font = NSFont.systemFont(ofSize: 13)
        closeLabel.textColor = NSColor(red: 0.6, green: 0.6, blue: 0.6, alpha: 1.0)
        closeLabel.translatesAutoresizingMaskIntoConstraints = false
        closeView.addSubview(closeLabel)

        closeView.onClick = { [weak self] in self?.closeClicked() }

        addSubview(closeView)

        // Layout
        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            titleLabel.trailingAnchor.constraint(equalTo: closeView.leadingAnchor, constant: -4),

            closeView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            closeView.centerYAnchor.constraint(equalTo: centerYAnchor),
            closeView.widthAnchor.constraint(equalToConstant: 20),
            closeView.heightAnchor.constraint(equalToConstant: 20),

            closeLabel.centerXAnchor.constraint(equalTo: closeView.centerXAnchor),
            closeLabel.centerYAnchor.constraint(equalTo: closeView.centerYAnchor),

            widthAnchor.constraint(greaterThanOrEqualToConstant: 80),
            heightAnchor.constraint(equalToConstant: 26),
        ])

        updateAppearance()

        // Click on entire tab to select
        let clickGesture = NSClickGestureRecognizer(target: self, action: #selector(tabClicked))
        addGestureRecognizer(clickGesture)
    }

    private func updateAppearance() {
        if isSelected {
            layer?.backgroundColor = NSColor(red: 0.176, green: 0.176, blue: 0.176, alpha: 1.0).cgColor
            titleLabel.textColor = NSColor.white
            closeView.alphaValue = 0.8
        } else {
            layer?.backgroundColor = NSColor.clear.cgColor
            titleLabel.textColor = NSColor(red: 0.5, green: 0.5, blue: 0.5, alpha: 1.0)
            closeView.alphaValue = 0.3
        }
    }

    @objc private func tabClicked() {
        onSelect?(index)
    }

    @objc private func closeClicked() {
        onClose?(index)
    }

    override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        if !isSelected {
            layer?.backgroundColor = NSColor(red: 0.15, green: 0.15, blue: 0.15, alpha: 1.0).cgColor
        }
        closeView.alphaValue = 0.8
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        updateAppearance()
    }
}
