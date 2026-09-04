import Cocoa
import WebKit

// Custom window that intercepts Cmd+W before text fields eat it
class BrowserWindow: NSWindow {
    weak var browserController: BrowserViewController?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags.contains(.command) else {
            return super.performKeyEquivalent(with: event)
        }

        switch event.keyCode {
        case 13: // Cmd+W — Close Tab
            browserController?.closeCurrentTab()
            return true
        case 17: // Cmd+T — New Tab
            browserController?.newTab()
            return true
        default:
            return super.performKeyEquivalent(with: event)
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {

    var mainWindow: BrowserWindow!
    var browserController: BrowserViewController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Create main window
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let windowWidth: CGFloat = min(1200, screenFrame.width * 0.8)
        let windowHeight: CGFloat = min(800, screenFrame.height * 0.85)
        let windowRect = NSRect(
            x: (screenFrame.width - windowWidth) / 2 + screenFrame.origin.x,
            y: (screenFrame.height - windowHeight) / 2 + screenFrame.origin.y,
            width: windowWidth,
            height: windowHeight
        )

        mainWindow = BrowserWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        mainWindow.title = "advcall"
        mainWindow.minSize = NSSize(width: 600, height: 400)
        mainWindow.isReleasedWhenClosed = false

        // Set window appearance to dark
        mainWindow.appearance = NSAppearance(named: .darkAqua)

        // Set app icon from bundle
        if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "icns"),
           let iconImage = NSImage(contentsOfFile: iconPath) {
            NSApp.applicationIconImage = iconImage
        } else if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "png"),
                  let iconImage = NSImage(contentsOfFile: iconPath) {
            NSApp.applicationIconImage = iconImage
        }

        // Create browser view controller
        browserController = BrowserViewController()
        mainWindow.browserController = browserController
        mainWindow.contentView = browserController.view

        mainWindow.makeKeyAndOrderFront(nil)

        // Set up menu
        setupMenu()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
        return true
    }

    // MARK: - Menu

    func setupMenu() {
        let mainMenu = NSMenu()

        // App menu
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About advcall", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit advcall", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appMenuItem = NSMenuItem()
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // File menu
        let fileMenu = NSMenu(title: "File")

        let newTabItem = NSMenuItem(title: "New Tab", action: #selector(BrowserViewController.newTab), keyEquivalent: "t")
        newTabItem.target = browserController
        fileMenu.addItem(newTabItem)

        let closeTabItem = NSMenuItem(title: "Close Tab", action: #selector(BrowserViewController.closeCurrentTab), keyEquivalent: "")
        closeTabItem.target = browserController
        fileMenu.addItem(closeTabItem)

        fileMenu.addItem(NSMenuItem.separator())

        let findItem = NSMenuItem(title: "Find...", action: #selector(BrowserViewController.find), keyEquivalent: "f")
        findItem.target = browserController
        fileMenu.addItem(findItem)

        let fileMenuItem = NSMenuItem()
        fileMenuItem.submenu = fileMenu
        mainMenu.addItem(fileMenuItem)

        // View menu
        let viewMenu = NSMenu(title: "View")

        let reloadItem = NSMenuItem(title: "Reload", action: #selector(BrowserViewController.reload), keyEquivalent: "r")
        reloadItem.target = browserController
        viewMenu.addItem(reloadItem)

        let forceReloadItem = NSMenuItem(title: "Force Reload", action: #selector(BrowserViewController.forceReload), keyEquivalent: "R")
        forceReloadItem.target = browserController
        viewMenu.addItem(forceReloadItem)

        viewMenu.addItem(NSMenuItem.separator())

        let devToolsItem = NSMenuItem(title: "Developer Tools", action: #selector(BrowserViewController.toggleDevTools), keyEquivalent: "")
        devToolsItem.target = browserController
        viewMenu.addItem(devToolsItem)

        viewMenu.addItem(NSMenuItem.separator())

        let zoomInItem = NSMenuItem(title: "Zoom In", action: #selector(BrowserViewController.zoomIn), keyEquivalent: "")
        zoomInItem.target = browserController
        viewMenu.addItem(zoomInItem)

        let zoomOutItem = NSMenuItem(title: "Zoom Out", action: #selector(BrowserViewController.zoomOut), keyEquivalent: "")
        zoomOutItem.target = browserController
        viewMenu.addItem(zoomOutItem)

        let zoomResetItem = NSMenuItem(title: "Actual Size", action: #selector(BrowserViewController.zoomReset), keyEquivalent: "")
        zoomResetItem.target = browserController
        viewMenu.addItem(zoomResetItem)

        let viewMenuItem = NSMenuItem()
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // History menu
        let historyMenu = NSMenu(title: "History")

        let backItem = NSMenuItem(title: "Back", action: #selector(BrowserViewController.goBack), keyEquivalent: "")
        backItem.target = browserController
        historyMenu.addItem(backItem)

        let forwardItem = NSMenuItem(title: "Forward", action: #selector(BrowserViewController.goForward), keyEquivalent: "")
        forwardItem.target = browserController
        historyMenu.addItem(forwardItem)

        let historyMenuItem = NSMenuItem()
        historyMenuItem.submenu = historyMenu
        mainMenu.addItem(historyMenuItem)

        NSApp.mainMenu = mainMenu
    }
}
