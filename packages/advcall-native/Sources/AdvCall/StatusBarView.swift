import Cocoa

class StatusBarView: NSView {

    private let infoLabel = NSTextField(labelWithString: "")
    private let tabCountLabel = NSTextField(labelWithString: "")

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
        layer?.backgroundColor = NSColor(red: 0.102, green: 0.102, blue: 0.102, alpha: 1.0).cgColor

        let borderLayer = CALayer()
        borderLayer.frame = NSRect(x: 0, y: frame.height - 1, width: frame.width, height: 1)
        borderLayer.backgroundColor = NSColor(red: 0.133, green: 0.133, blue: 0.133, alpha: 1.0).cgColor
        borderLayer.name = "topBorder"
        layer?.addSublayer(borderLayer)

        infoLabel.translatesAutoresizingMaskIntoConstraints = false
        infoLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        infoLabel.textColor = NSColor(red: 0.333, green: 0.333, blue: 0.333, alpha: 1.0)
        infoLabel.lineBreakMode = .byTruncatingTail
        addSubview(infoLabel)

        tabCountLabel.translatesAutoresizingMaskIntoConstraints = false
        tabCountLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
        tabCountLabel.textColor = NSColor(red: 0.333, green: 0.333, blue: 0.333, alpha: 1.0)
        tabCountLabel.alignment = .right
        addSubview(tabCountLabel)

        NSLayoutConstraint.activate([
            infoLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            infoLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            infoLabel.trailingAnchor.constraint(lessThanOrEqualTo: tabCountLabel.leadingAnchor, constant: -10),

            tabCountLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            tabCountLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    override func layout() {
        super.layout()
        // Update border
        if let border = layer?.sublayers?.first(where: { $0.name == "topBorder" }) {
            border.frame = NSRect(x: 0, y: bounds.height - 1, width: bounds.width, height: 1)
        }
    }

    func update(tabCount: Int, info: String) {
        infoLabel.stringValue = info
        tabCountLabel.stringValue = "\(tabCount) tab\(tabCount != 1 ? "s" : "")"
    }
}
