// RRightclickrr IExplorerCommand Implementation Header

#pragma once

#include <windows.h>
#include <shobjidl.h>
#include <shlwapi.h>

enum class CommandType
{
    RootMenu,      // Parent menu with icon
    SyncToDrive,
    CopyToDrive,
    GetDriveURL
};

class CExplorerCommand : public IExplorerCommand, public IObjectWithSite
{
public:
    CExplorerCommand(CommandType type);

    // IUnknown
    IFACEMETHODIMP QueryInterface(REFIID riid, void **ppv);
    IFACEMETHODIMP_(ULONG) AddRef();
    IFACEMETHODIMP_(ULONG) Release();

    // IExplorerCommand
    IFACEMETHODIMP GetTitle(IShellItemArray *psiItemArray, LPWSTR *ppszName);
    IFACEMETHODIMP GetIcon(IShellItemArray *psiItemArray, LPWSTR *ppszIcon);
    IFACEMETHODIMP GetToolTip(IShellItemArray *psiItemArray, LPWSTR *ppszInfotip);
    IFACEMETHODIMP GetCanonicalName(GUID *pguidCommandName);
    IFACEMETHODIMP GetState(IShellItemArray *psiItemArray, BOOL fOkToBeSlow, EXPCMDSTATE *pCmdState);
    IFACEMETHODIMP Invoke(IShellItemArray *psiItemArray, IBindCtx *pbc);
    IFACEMETHODIMP GetFlags(EXPCMDFLAGS *pFlags);
    IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand **ppEnum);

    // IObjectWithSite
    IFACEMETHODIMP SetSite(IUnknown *pUnkSite);
    IFACEMETHODIMP GetSite(REFIID riid, void **ppv);

private:
    ~CExplorerCommand();

    HRESULT GetAppPath(LPWSTR pszPath, DWORD cchPath);
    HRESULT GetSelectedPath(IShellItemArray *psiItemArray, LPWSTR pszPath, DWORD cchPath);

    long m_cRef;
    CommandType m_type;
    IUnknown *m_pSite;
};

extern HMODULE g_hModule;
extern long g_cDllRef;
