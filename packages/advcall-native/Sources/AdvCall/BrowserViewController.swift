import Cocoa
import WebKit

// MARK: - Tab Data

class Tab: NSObject {
    let id: UUID
    var webView: WKWebView?
    var url: URL?
    var title: String?
    var isLoading: Bool = false

    init(url: URL? = nil) {
        self.id = UUID()
        self.url = url
    }
}

// MARK: - Browser View Controller

class BrowserViewController: NSViewController, WKNavigationDelegate, WKUIDelegate, NSTextFieldDelegate {

    // UI Elements
    private var tabBar: TabBarView!
    private var navBar: NavigationBarView!
    private var status: StatusBarView!
    private var webViewContainer: NSView!

    // State
    private var tabs: [Tab] = []
    private var currentTabIndex: Int = 0
    private var homeURL: URL? = URL(string: "https://github.com")

    // Quick links
    private let quickLinks: [(title: String, url: String)] = [
        ("GitHub", "https://github.com"),
        ("SO", "https://stackoverflow.com"),
        ("MDN", "https://developer.mozilla.org"),
        ("DevDocs", "https://devdocs.io"),
        (":3000", "http://localhost:3000"),
        (":8080", "http://localhost:8080"),
        (":5173", "http://localhost:5173"),
    ]

    // MARK: - Lifecycle

    override func loadView() {
        self.view = NSView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupKeyboardShortcuts()
        newTab()
    }

    // MARK: - UI Setup

    func setupUI() {
        // Tab bar (top)
        tabBar = TabBarView(frame: .zero)
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.onTabSelected = { [weak self] index in self?.switchToTab(index) }
        tabBar.onTabClose = { [weak self] index in self?.closeTab(at: index) }
        tabBar.onNewTab = { [weak self] in self?.newTab() }
        view.addSubview(tabBar)

        // Navigation bar
        navBar = NavigationBarView(frame: .zero)
        navBar.translatesAutoresizingMaskIntoConstraints = false
        navBar.onNavigate = { [weak self] url in self?.navigate(to: url) }
        navBar.onBack = { [weak self] in self?.goBack() }
        navBar.onForward = { [weak self] in self?.goForward() }
        navBar.onReload = { [weak self] in self?.reload() }
        navBar.onHome = { [weak self] in self?.goHome() }
        navBar.onQuickLink = { [weak self] url in self?.navigate(to: url) }
        navBar.quickLinks = quickLinks
        view.addSubview(navBar)

        // Web view container
        webViewContainer = NSView(frame: .zero)
        webViewContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webViewContainer)

        // Status bar (bottom)
        status = StatusBarView(frame: .zero)
        status.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(status)

        // Layout constraints
        NSLayoutConstraint.activate([
            // Tab bar
            tabBar.topAnchor.constraint(equalTo: view.topAnchor),
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.heightAnchor.constraint(equalToConstant: 36),

            // Nav bar
            navBar.topAnchor.constraint(equalTo: tabBar.bottomAnchor),
            navBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            navBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            navBar.heightAnchor.constraint(equalToConstant: 42),

            // Web view container
            webViewContainer.topAnchor.constraint(equalTo: navBar.bottomAnchor),
            webViewContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webViewContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webViewContainer.bottomAnchor.constraint(equalTo: status.topAnchor),

            // Status bar
            status.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            status.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            status.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            status.heightAnchor.constraint(equalToConstant: 22),
        ])
    }

    // MARK: - Tab Management

    @objc func newTab() {
        let tab = Tab(url: homeURL)
        tabs.append(tab)

        let webView = createWebView()
        tab.webView = webView

        webViewContainer.addSubview(webView)
        webView.frame = webViewContainer.bounds
        webView.autoresizingMask = [.width, .height]

        switchToTab(tabs.count - 1)

        if let url = tab.url {
            webView.load(URLRequest(url: url))
        }

        updateTabBar()
    }

    @objc func closeCurrentTab() {
        closeTab(at: currentTabIndex)
    }

    func closeTab(at index: Int) {
        guard tabs.count > 1, index >= 0, index < tabs.count else { return }

        let tab = tabs[index]
        tab.webView?.removeFromSuperview()
        tab.webView = nil
        tabs.remove(at: index)

        if currentTabIndex >= tabs.count {
            currentTabIndex = tabs.count - 1
        } else if currentTabIndex > index {
            currentTabIndex -= 1
        }

        showCurrentWebView()
        updateTabBar()
        updateNavBar()
        updateStatusBar()
    }

    func switchToTab(_ index: Int) {
        guard index >= 0, index < tabs.count else { return }
        currentTabIndex = index
        showCurrentWebView()
        updateTabBar()
        updateNavBar()
        updateStatusBar()
    }

    private func showCurrentWebView() {
        guard let webView = tabs[currentTabIndex].webView else { return }
        for subview in webViewContainer.subviews {
            subview.isHidden = true
        }
        webView.isHidden = false
        webView.frame = webViewContainer.bounds
    }

    // MARK: - WebView Creation

    private func createWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.allowsAirPlayForMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true

        // Dark background for loading state
        webView.setValue(false, forKey: "drawsBackground")

        return webView
    }

    // MARK: - Navigation

    func navigate(to urlString: String) {
        var url = urlString

        // If it looks like a URL, use it directly
        if url.contains(".") && !url.contains(" ") {
            if !url.hasPrefix("http://") && !url.hasPrefix("https://") {
                url = "http://" + url
            }
        } else {
            // Otherwise, search with DuckDuckGo
            url = "https://duckduckgo.com/?q=" + url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
        }

        guard let validURL = URL(string: url) else { return }
        tabs[currentTabIndex].url = validURL
        tabs[currentTabIndex].webView?.load(URLRequest(url: validURL))
    }

    @objc func goBack() {
        tabs[currentTabIndex].webView?.goBack()
    }

    @objc func goForward() {
        tabs[currentTabIndex].webView?.goForward()
    }

    @objc func reload() {
        tabs[currentTabIndex].webView?.reload()
    }

    @objc func forceReload() {
        tabs[currentTabIndex].webView?.reloadFromOrigin()
    }

    func goHome() {
        if let url = homeURL {
            navigate(to: url.absoluteString)
        }
    }

    // MARK: - Zoom

    @objc func zoomIn() {
        guard let webView = tabs[currentTabIndex].webView else { return }
        let newZoom = min(webView.pageZoom + 0.1, 3.0)
        webView.pageZoom = newZoom
    }

    @objc func zoomOut() {
        guard let webView = tabs[currentTabIndex].webView else { return }
        let newZoom = max(webView.pageZoom - 0.1, 0.3)
        webView.pageZoom = newZoom
    }

    @objc func zoomReset() {
        tabs[currentTabIndex].webView?.pageZoom = 1.0
    }

    // MARK: - Find

    @objc func find() {
        // Use JavaScript to highlight text in page
        guard let webView = tabs[currentTabIndex].webView else { return }
        let script = "window.getSelection().toString()"
        webView.evaluateJavaScript(script) { result, error in
            if let text = result as? String, !text.isEmpty {
                // Could implement find bar here
            }
        }
    }

    // MARK: - DevTools

    @objc func toggleDevTools() {
        guard let webView = tabs[currentTabIndex].webView else { return }
        // Trigger inspect element by using the WebKit internals
        let selector = NSSelectorFromString("showHideWebInspector:")
        if webView.responds(to: selector) {
            webView.perform(selector, with: nil)
        }
    }

    // MARK: - Keyboard Shortcuts

    func setupKeyboardShortcuts() {
        // Keyboard shortcuts are handled by BrowserWindow.performKeyEquivalent
        // This method is kept for any future non-command shortcuts
    }

    // MARK: - UI Updates

    func updateTabBar() {
        let titles = tabs.map { tab -> String in
            if let title = tab.title, !title.isEmpty {
                return title.count > 20 ? String(title.prefix(20)) + "…" : title
            }
            return tab.url?.host ?? "New Tab"
        }
        tabBar.updateTabs(titles: titles, selectedIndex: currentTabIndex)
    }

    func updateNavBar() {
        let url = tabs[currentTabIndex].url?.absoluteString ?? ""
        let canGoBack = tabs[currentTabIndex].webView?.canGoBack ?? false
        let canGoForward = tabs[currentTabIndex].webView?.canGoForward ?? false
        navBar.update(url: url, canGoBack: canGoBack, canGoForward: canGoForward)
    }

    func updateStatusBar() {
        let tabCount = tabs.count
        let currentTitle = tabs[currentTabIndex].title ?? tabs[currentTabIndex].url?.host ?? ""
        status.update(tabCount: tabCount, info: currentTitle)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard let index = tabIndex(for: webView) else { return }
        tabs[index].isLoading = true
        if index == currentTabIndex {
            navBar.setLoading(true)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let index = tabIndex(for: webView) else { return }
        tabs[index].isLoading = false
        tabs[index].url = webView.url
        tabs[index].title = webView.title

        if index == currentTabIndex {
            navBar.setLoading(false)
            updateNavBar()
            updateStatusBar()
        }
        updateTabBar()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard let index = tabIndex(for: webView) else { return }
        tabs[index].isLoading = false
        if index == currentTabIndex {
            navBar.setLoading(false)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Open links in new tab instead of new window
        if navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == false {
            if let url = navigationAction.request.url {
                newTab()
                navigate(to: url.absoluteString)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "JavaScript Alert"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "JavaScript Confirm"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let result = alert.runModal() == .alertFirstButtonReturn
        completionHandler(result)
    }

    // MARK: - Helpers

    func tabIndex(for webView: WKWebView) -> Int? {
        return tabs.firstIndex { $0.webView === webView }
    }
}
