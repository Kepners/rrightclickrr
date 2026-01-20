// RRightclickrr IExplorerCommand Implementation

#include "ExplorerCommand.h"
#include "resource.h"
#include <strsafe.h>
#include <pathcch.h>
#include <shellapi.h>
#include <new>

#pragma comment(lib, "pathcch.lib")
#pragma comment(lib, "shell32.lib")

// Forward declaration
class CEnumExplorerCommand;

// Helper to get icon path
static HRESULT GetIconPath(LPWSTR pszPath, DWORD cchPath)
{
    WCHAR szDllPath[MAX_PATH];
    if (GetModuleFileNameW(g_hModule, szDllPath, ARRAYSIZE(szDllPath)) == 0)
        return HRESULT_FROM_WIN32(GetLastError());

    HRESULT hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr)) return hr;

    hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr)) return hr;

    return PathCchCombine(pszPath, cchPath, szDllPath, L"assets\\rrightclickrr.ico");
}

// Enumerator for subcommands
class CEnumExplorerCommand : public IEnumExplorerCommand
{
public:
    CEnumExplorerCommand(bool isFolder) : m_cRef(1), m_nCurrent(0), m_isFolder(isFolder)
    {
        InterlockedIncrement(&g_cDllRef);
    }

    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void **ppv)
    {
        static const QITAB qit[] = {
            QITABENT(CEnumExplorerCommand, IEnumExplorerCommand),
            { 0 },
        };
        return QISearch(this, qit, riid, ppv);
    }

    IFACEMETHODIMP_(ULONG) AddRef() { return InterlockedIncrement(&m_cRef); }
    IFACEMETHODIMP_(ULONG) Release()
    {
        long cRef = InterlockedDecrement(&m_cRef);
        if (cRef == 0) delete this;
        return cRef;
    }

    // IEnumExplorerCommand
    IFACEMETHODIMP Next(ULONG celt, IExplorerCommand **pUICommand, ULONG *pceltFetched)
    {
        ULONG fetched = 0;

        // For folders: Sync, Copy, GetURL
        // For files: Copy, GetURL
        CommandType commands[] = {
            CommandType::SyncToDrive,
            CommandType::CopyToDrive,
            CommandType::GetDriveURL
        };
        int startIdx = m_isFolder ? 0 : 1;  // Skip Sync for files
        int totalCommands = m_isFolder ? 3 : 2;

        while (fetched < celt && (m_nCurrent - startIdx) < totalCommands)
        {
            if (m_nCurrent >= startIdx)
            {
                CExplorerCommand *pCmd = new (std::nothrow) CExplorerCommand(commands[m_nCurrent]);
                if (pCmd)
                {
                    pCmd->QueryInterface(IID_PPV_ARGS(&pUICommand[fetched]));
                    pCmd->Release();
                    fetched++;
                }
            }
            m_nCurrent++;
        }

        if (pceltFetched) *pceltFetched = fetched;
        return (fetched == celt) ? S_OK : S_FALSE;
    }

    IFACEMETHODIMP Skip(ULONG celt) { m_nCurrent += celt; return S_OK; }
    IFACEMETHODIMP Reset() { m_nCurrent = 0; return S_OK; }
    IFACEMETHODIMP Clone(IEnumExplorerCommand **ppEnum)
    {
        *ppEnum = new (std::nothrow) CEnumExplorerCommand(m_isFolder);
        return *ppEnum ? S_OK : E_OUTOFMEMORY;
    }

private:
    ~CEnumExplorerCommand() { InterlockedDecrement(&g_cDllRef); }
    long m_cRef;
    ULONG m_nCurrent;
    bool m_isFolder;
};

CExplorerCommand::CExplorerCommand(CommandType type)
    : m_cRef(1), m_type(type), m_pSite(nullptr)
{
    InterlockedIncrement(&g_cDllRef);
}

CExplorerCommand::~CExplorerCommand()
{
    if (m_pSite)
        m_pSite->Release();
    InterlockedDecrement(&g_cDllRef);
}

// IUnknown
IFACEMETHODIMP CExplorerCommand::QueryInterface(REFIID riid, void **ppv)
{
    static const QITAB qit[] = {
        QITABENT(CExplorerCommand, IExplorerCommand),
        QITABENT(CExplorerCommand, IObjectWithSite),
        { 0 },
    };
    return QISearch(this, qit, riid, ppv);
}

IFACEMETHODIMP_(ULONG) CExplorerCommand::AddRef()
{
    return InterlockedIncrement(&m_cRef);
}

IFACEMETHODIMP_(ULONG) CExplorerCommand::Release()
{
    long cRef = InterlockedDecrement(&m_cRef);
    if (cRef == 0)
        delete this;
    return cRef;
}

// IExplorerCommand
IFACEMETHODIMP CExplorerCommand::GetTitle(IShellItemArray *psiItemArray, LPWSTR *ppszName)
{
    UNREFERENCED_PARAMETER(psiItemArray);

    LPCWSTR title;
    switch (m_type)
    {
    case CommandType::RootMenu:
        title = L"RRightclickrr";
        break;
    case CommandType::SyncToDrive:
        title = L"Sync to Google Drive";
        break;
    case CommandType::CopyToDrive:
        title = L"Copy to Google Drive";
        break;
    case CommandType::GetDriveURL:
        title = L"Copy Google Drive Link";
        break;
    default:
        title = L"RRightclickrr";
    }

    return SHStrDupW(title, ppszName);
}

IFACEMETHODIMP CExplorerCommand::GetIcon(IShellItemArray *psiItemArray, LPWSTR *ppszIcon)
{
    UNREFERENCED_PARAMETER(psiItemArray);

    WCHAR szIconPath[MAX_PATH];
    HRESULT hr = GetIconPath(szIconPath, ARRAYSIZE(szIconPath));
    if (FAILED(hr))
    {
        *ppszIcon = nullptr;
        return E_FAIL;
    }

    return SHStrDupW(szIconPath, ppszIcon);
}

IFACEMETHODIMP CExplorerCommand::GetToolTip(IShellItemArray *psiItemArray, LPWSTR *ppszInfotip)
{
    UNREFERENCED_PARAMETER(psiItemArray);

    LPCWSTR tooltip;
    switch (m_type)
    {
    case CommandType::RootMenu:
        tooltip = L"Sync files and folders to Google Drive";
        break;
    case CommandType::SyncToDrive:
        tooltip = L"Sync this folder to Google Drive and watch for changes";
        break;
    case CommandType::CopyToDrive:
        tooltip = L"Copy to Google Drive (one-time upload)";
        break;
    case CommandType::GetDriveURL:
        tooltip = L"Copy the Google Drive URL to clipboard";
        break;
    default:
        tooltip = L"RRightclickrr";
    }

    return SHStrDupW(tooltip, ppszInfotip);
}

IFACEMETHODIMP CExplorerCommand::GetCanonicalName(GUID *pguidCommandName)
{
    switch (m_type)
    {
    case CommandType::RootMenu:
        *pguidCommandName = { 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6a } };
        break;
    case CommandType::SyncToDrive:
        *pguidCommandName = { 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6b } };
        break;
    case CommandType::CopyToDrive:
        *pguidCommandName = { 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6c } };
        break;
    case CommandType::GetDriveURL:
        *pguidCommandName = { 0x7b3b5e52, 0xa1f0, 0x4c5e, { 0x9b, 0x8a, 0x1c, 0x2d, 0x3e, 0x4f, 0x5a, 0x6d } };
        break;
    }
    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::GetState(IShellItemArray *psiItemArray, BOOL fOkToBeSlow, EXPCMDSTATE *pCmdState)
{
    UNREFERENCED_PARAMETER(fOkToBeSlow);

    *pCmdState = ECS_ENABLED;

    if (psiItemArray == nullptr)
    {
        // Root menu should still show
        if (m_type != CommandType::RootMenu)
            *pCmdState = ECS_HIDDEN;
        return S_OK;
    }

    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::Invoke(IShellItemArray *psiItemArray, IBindCtx *pbc)
{
    UNREFERENCED_PARAMETER(pbc);

    // Root menu doesn't invoke - it has subcommands
    if (m_type == CommandType::RootMenu)
        return S_OK;

    if (psiItemArray == nullptr)
        return E_INVALIDARG;

    WCHAR szPath[MAX_PATH];
    HRESULT hr = GetSelectedPath(psiItemArray, szPath, ARRAYSIZE(szPath));
    if (FAILED(hr))
        return hr;

    WCHAR szAppPath[MAX_PATH];
    hr = GetAppPath(szAppPath, ARRAYSIZE(szAppPath));
    if (FAILED(hr))
        return hr;

    WCHAR szArgs[MAX_PATH * 2];
    switch (m_type)
    {
    case CommandType::SyncToDrive:
        StringCchPrintfW(szArgs, ARRAYSIZE(szArgs), L"--sync \"%s\"", szPath);
        break;
    case CommandType::CopyToDrive:
        StringCchPrintfW(szArgs, ARRAYSIZE(szArgs), L"--copy \"%s\"", szPath);
        break;
    case CommandType::GetDriveURL:
        StringCchPrintfW(szArgs, ARRAYSIZE(szArgs), L"--get-url \"%s\"", szPath);
        break;
    default:
        return E_INVALIDARG;
    }

    SHELLEXECUTEINFOW sei = { sizeof(sei) };
    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
    sei.lpFile = szAppPath;
    sei.lpParameters = szArgs;
    sei.nShow = SW_SHOWNORMAL;

    if (!ShellExecuteExW(&sei))
        return HRESULT_FROM_WIN32(GetLastError());

    if (sei.hProcess)
        CloseHandle(sei.hProcess);

    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::GetFlags(EXPCMDFLAGS *pFlags)
{
    if (m_type == CommandType::RootMenu)
        *pFlags = ECF_HASSUBCOMMANDS;
    else
        *pFlags = ECF_DEFAULT;
    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::EnumSubCommands(IEnumExplorerCommand **ppEnum)
{
    if (m_type != CommandType::RootMenu)
    {
        *ppEnum = nullptr;
        return E_NOTIMPL;
    }

    // Create enumerator - for now assume files (show Copy and GetURL)
    // The actual filtering happens in GetState of child commands
    *ppEnum = new (std::nothrow) CEnumExplorerCommand(true);
    return *ppEnum ? S_OK : E_OUTOFMEMORY;
}

// IObjectWithSite
IFACEMETHODIMP CExplorerCommand::SetSite(IUnknown *pUnkSite)
{
    if (m_pSite)
        m_pSite->Release();

    m_pSite = pUnkSite;

    if (m_pSite)
        m_pSite->AddRef();

    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::GetSite(REFIID riid, void **ppv)
{
    if (m_pSite)
        return m_pSite->QueryInterface(riid, ppv);

    *ppv = nullptr;
    return E_FAIL;
}

// Helper: Get the app executable path
HRESULT CExplorerCommand::GetAppPath(LPWSTR pszPath, DWORD cchPath)
{
    WCHAR szDllPath[MAX_PATH];
    if (GetModuleFileNameW(g_hModule, szDllPath, ARRAYSIZE(szDllPath)) == 0)
        return HRESULT_FROM_WIN32(GetLastError());

    HRESULT hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
        return hr;

    hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
        return hr;

    hr = PathCchCombine(pszPath, cchPath, szDllPath, L"RRightclickrr.exe");
    return hr;
}

// Helper: Get the selected file/folder path
HRESULT CExplorerCommand::GetSelectedPath(IShellItemArray *psiItemArray, LPWSTR pszPath, DWORD cchPath)
{
    IShellItem *psi = nullptr;
    HRESULT hr = psiItemArray->GetItemAt(0, &psi);
    if (FAILED(hr))
        return hr;

    PWSTR pszName = nullptr;
    hr = psi->GetDisplayName(SIGDN_FILESYSPATH, &pszName);
    if (SUCCEEDED(hr))
    {
        hr = StringCchCopyW(pszPath, cchPath, pszName);
        CoTaskMemFree(pszName);
    }

    psi->Release();
    return hr;
}
