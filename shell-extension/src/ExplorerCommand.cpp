// RRightclickrr IExplorerCommand Implementation

#include "ExplorerCommand.h"
#include "resource.h"
#include <strsafe.h>
#include <pathcch.h>
#include <shellapi.h>

#pragma comment(lib, "pathcch.lib")
#pragma comment(lib, "shell32.lib")

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

    // Get the DLL path for icon resource reference
    WCHAR szDllPath[MAX_PATH];
    if (GetModuleFileNameW(g_hModule, szDllPath, ARRAYSIZE(szDllPath)) == 0)
    {
        *ppszIcon = nullptr;
        return E_FAIL;
    }

    // Get the icon resource ID based on command type
    int iconResourceId;
    switch (m_type)
    {
    case CommandType::SyncToDrive:
        iconResourceId = IDI_SYNC_ICON;
        break;
    case CommandType::CopyToDrive:
        iconResourceId = IDI_COPY_ICON;
        break;
    case CommandType::GetDriveURL:
        iconResourceId = IDI_LINK_ICON;
        break;
    default:
        iconResourceId = IDI_SYNC_ICON;
    }

    // Format as "dllpath,-resourceID" which is what Windows shell expects
    WCHAR szIcon[MAX_PATH + 16];
    StringCchPrintfW(szIcon, ARRAYSIZE(szIcon), L"%s,-%d", szDllPath, iconResourceId);

    return SHStrDupW(szIcon, ppszIcon);
}

IFACEMETHODIMP CExplorerCommand::GetToolTip(IShellItemArray *psiItemArray, LPWSTR *ppszInfotip)
{
    UNREFERENCED_PARAMETER(psiItemArray);

    LPCWSTR tooltip;
    switch (m_type)
    {
    case CommandType::SyncToDrive:
        tooltip = L"Sync this folder to Google Drive and watch for changes";
        break;
    case CommandType::CopyToDrive:
        tooltip = L"Copy this folder to Google Drive (one-time upload)";
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
    // Return a unique GUID for each command type
    switch (m_type)
    {
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
        *pCmdState = ECS_HIDDEN;
        return S_OK;
    }

    // For "Copy Drive Link" - only show if item might be synced
    // For now, we show all commands and let the app handle validation

    DWORD count = 0;
    if (SUCCEEDED(psiItemArray->GetCount(&count)) && count > 0)
    {
        // Check if it's a folder (for sync/copy commands)
        IShellItem *psi = nullptr;
        if (SUCCEEDED(psiItemArray->GetItemAt(0, &psi)))
        {
            SFGAOF attrs;
            if (SUCCEEDED(psi->GetAttributes(SFGAO_FOLDER, &attrs)))
            {
                // Sync only works on folders (Copy works on both files and folders)
                if (m_type == CommandType::SyncToDrive)
                {
                    if (!(attrs & SFGAO_FOLDER))
                    {
                        *pCmdState = ECS_HIDDEN;
                    }
                }
            }
            psi->Release();
        }
    }

    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::Invoke(IShellItemArray *psiItemArray, IBindCtx *pbc)
{
    UNREFERENCED_PARAMETER(pbc);

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

    // Build command line arguments based on command type
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
    }

    // Execute the app
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
    *pFlags = ECF_DEFAULT;
    return S_OK;
}

IFACEMETHODIMP CExplorerCommand::EnumSubCommands(IEnumExplorerCommand **ppEnum)
{
    *ppEnum = nullptr;
    return E_NOTIMPL;
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
    // Get path relative to DLL location
    // DLL is in: <install>\shell-extension\RRightclickrrShell.dll
    // App is in: <install>\RRightclickrr.exe

    WCHAR szDllPath[MAX_PATH];
    if (GetModuleFileNameW(g_hModule, szDllPath, ARRAYSIZE(szDllPath)) == 0)
        return HRESULT_FROM_WIN32(GetLastError());

    // Remove DLL filename to get directory
    HRESULT hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
        return hr;

    // Go up one level (from shell-extension folder)
    hr = PathCchRemoveFileSpec(szDllPath, ARRAYSIZE(szDllPath));
    if (FAILED(hr))
        return hr;

    // Append app name
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
