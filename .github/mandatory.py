#!/usr/bin/env python3
"""Mandatory task runner. Standard library only; add tasks to TASKS below."""
import argparse
from pathlib import Path
import re
import subprocess
import sys

# This exact, explicit region is the only version source. Never search prose for vN.
TARGET = 'index.html'
START = '<!-- app-version:start -->'
END = '<!-- app-version:end -->'
REGION = re.compile(re.escape(START) + r'<small id="app-version">v([1-9][0-9]*)</small>' + re.escape(END))


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.PIPE)


def region(number):
    return f'{START}<small id="app-version">v{number}</small>{END}'


def read_version(text):
    matches = list(REGION.finditer(text))
    if len(matches) != 1 or text.count(START) != 1 or text.count(END) != 1:
        raise ValueError(f'{TARGET}: 正式バージョン領域が欠落・重複・破損しています。指定領域を1か所に復元してください。')
    return int(matches[0][1])


def version_task(base, fix):
    path = Path(TARGET)
    current = path.read_text(encoding='utf-8')
    actual = read_version(current)
    old = git('show', f'{base}:{TARGET}').decode('utf-8')
    previous = read_version(old)
    changed = False
    # Include staged, unstaged and new files; exclude ignored files and version-only changes.
    names = set(git('diff', '--name-only', '-z', base, '--').split(b'\0'))
    names.update(git('ls-files', '--others', '--exclude-standard', '-z').split(b'\0'))
    for name in names - {b''}:
        if name.decode() != TARGET or REGION.sub('<VERSION>', old) != REGION.sub('<VERSION>', current):
            changed = True
    expected = previous + int(changed)
    if fix and actual != expected:
        path.write_text(REGION.sub(lambda _: region(expected), current), encoding='utf-8')
        actual = read_version(path.read_text(encoding='utf-8'))
    if actual != expected:
        raise ValueError(f'表示バージョン: v{actual} → v{expected} が必要です。同じ --base で --fix を実行してください。')


def google_request(token, service, path, method='GET', payload=None, query=None):
    """Use only Google's fixed API hosts; never print tokens or raw API errors."""
    import json
    from urllib.request import Request, urlopen
    from urllib.parse import urlencode
    from urllib.error import HTTPError, URLError
    hosts = {'script': 'https://script.googleapis.com/v1/', 'drive': 'https://www.googleapis.com/drive/v3/'}
    url = hosts[service] + path + ('?' + urlencode(query) if query else '')
    request = Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                      headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        raise ValueError(f'Google {service} API: HTTP {error.code}。認証・共有権限・API設定を確認して再実行してください。') from None
    except URLError:
        raise ValueError('Google APIへ接続できません。接続を確認して再実行してください。') from None


def gas_projects():
    import json
    import os
    names = {n.decode() for n in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split(b'\0') if n}
    # clasp configuration may intentionally be gitignored; it is still authoritative locally.
    configs = set(Path('.').rglob('.clasp*.json'))
    configs = {p for p in configs if not any(part in {'.git', 'node_modules', '.venv'} for part in p.parts)}
    evidence = bool(configs) or any(n.endswith('.gs') or Path(n).name == 'appsscript.json' for n in names)
    raw = os.environ.get('GAS_SHARE_PROJECTS_JSON', '[]')
    try:
        projects = json.loads(raw)
        if not isinstance(projects, list):
            raise ValueError()
        by_id = {}
        for project in projects:
            if not isinstance(project, dict) or not re.fullmatch(r'[A-Za-z0-9_-]+', project.get('scriptId', '')):
                raise ValueError()
            key = project.get('tokenEnv', 'GAS_GOOGLE_ACCESS_TOKEN')
            if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or project['scriptId'] in by_id:
                raise ValueError()
            by_id[project['scriptId']] = key
        for path in sorted(configs):
            script_id = json.loads(path.read_text()).get('scriptId')
            if not isinstance(script_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', script_id):
                raise ValueError()
            by_id.setdefault(script_id, 'GAS_GOOGLE_ACCESS_TOKEN')
    except (ValueError, TypeError):
        raise ValueError('GASのscriptId・tokenEnv設定が不正です。.clasp設定とGAS_SHARE_PROJECTS_JSONを確認してください。') from None
    if evidence and not by_id:
        raise ValueError('GASが存在しますが共有対象が未登録です。実際の作成結果のscriptIdを設定してください。')
    return by_id


def gas_share_task(base, fix):
    import os
    from urllib.parse import quote
    projects = gas_projects()
    if not projects:
        return
    recipient = os.environ.get('GAS_SHARE_RECIPIENT', '').strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', recipient):
        raise ValueError('GAS_SHARE_RECIPIENTが未設定です。非公開repository-creator/AGENTS.mdの固定共有先を設定してください。')
    errors = []
    for index, (script_id, token_env) in enumerate(projects.items(), 1):
        try:
            token = os.environ.get(token_env, '')
            if not token:
                raise ValueError(f'{token_env} が未設定です。作成元アカウントの共有可能な認証が必要です。')
            project = google_request(token, 'script', 'projects/' + quote(script_id, safe=''))
            if project.get('scriptId') != script_id:
                raise ValueError('Apps Scriptプロジェクトの同一性を確認できません。')
            file_id = project.get('parentId') or script_id
            file_path = 'files/' + quote(file_id, safe='')
            metadata = google_request(token, 'drive', file_path, query={'fields': 'id,mimeType,trashed', 'supportsAllDrives': 'true'})
            allowed = {'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.document', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.form'} if project.get('parentId') else {'application/vnd.google-apps.script'}
            if metadata.get('id') != file_id or metadata.get('trashed') or metadata.get('mimeType') not in allowed:
                raise ValueError('GASまたは親ファイルの種類・IDを確認できません。共有対象を確認してください。')

            def permissions():
                result, page = [], None
                while True:
                    query = {'fields': 'nextPageToken,permissions(id,type,emailAddress,role,deleted,expirationTime)', 'supportsAllDrives': 'true', 'pageSize': 100}
                    if page:
                        query['pageToken'] = page
                    data = google_request(token, 'drive', file_path + '/permissions', query=query)
                    result.extend(p for p in data.get('permissions', []) if p.get('type') == 'user' and not p.get('deleted') and p.get('emailAddress', '').lower() == recipient)
                    page = data.get('nextPageToken')
                    if not page:
                        return result

            def sufficient(items):
                return any(p.get('role') in {'owner', 'organizer', 'fileOrganizer', 'writer'} and not p.get('expirationTime') for p in items)

            current = permissions()
            if not sufficient(current) and fix:
                if current:
                    permission = current[0]
                    google_request(token, 'drive', file_path + '/permissions/' + quote(permission['id'], safe=''), 'PATCH',
                                   {'role': 'writer'}, {'supportsAllDrives': 'true', 'removeExpiration': 'true'})
                else:
                    google_request(token, 'drive', file_path + '/permissions', 'POST',
                                   {'type': 'user', 'role': 'writer', 'emailAddress': recipient},
                                   {'supportsAllDrives': 'true', 'sendNotificationEmail': 'false'})
                current = permissions()
            if not sufficient(current):
                raise ValueError('固定共有先への継続的な編集権限を確認できません。--fixで共有し再検査してください。')
        except Exception as error:
            errors.append(f'GAS対象{index}: {error}')
    if errors:
        raise ValueError('\n'.join(errors))


def githack_url(owner, repository, branch, entry='index.html'):
    """Return the preview URL for an already pushed public GitHub branch."""
    from urllib.parse import quote
    if not re.fullmatch(r'[A-Za-z0-9._-]+', branch):
        raise ValueError('GitHack URLを確定する作業ブランチは英数字・._-だけで命名してください。')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', owner) or not re.fullmatch(r'[A-Za-z0-9_.-]+', repository):
        raise ValueError('GitHubのowner/repository名を確認できません。')
    if not re.fullmatch(r'[A-Za-z0-9_./-]+\.html', entry) or entry.startswith('/') or '..' in entry.split('/'):
        raise ValueError('GitHackの入口HTMLパスが不正です。')
    return 'https://raw.githack.com/{}/{}/{}/{}'.format(owner, repository, branch, quote(entry, safe='/'))


def githack_task(base, fix):
    """For a feature branch, verify it is pushed and print the exact preview URL."""
    try:
        branch = git('symbolic-ref', '--quiet', '--short', 'HEAD').decode().strip()
    except subprocess.CalledProcessError:
        raise ValueError('detached HEADではGitHack URLを報告できません。名前付きブランチで作業してください。')
    if branch == 'main':
        return
    origin = git('remote', 'get-url', 'origin').decode().strip()
    match = re.fullmatch(r'(?:https://github\.com/|git@github\.com:)([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?', origin)
    if not match:
        raise ValueError('GitHack URLにはGitHub originが必要です。')
    local = git('rev-parse', 'HEAD').decode().strip()
    remote = subprocess.run(['git', 'ls-remote', '--heads', 'origin', 'refs/heads/' + branch], capture_output=True, text=True)
    remote_sha = remote.stdout.split()[0] if remote.returncode == 0 and remote.stdout.split() else ''
    if remote_sha != local:
        raise ValueError('GitHack URLを報告する前に、このブランチをcommitしてoriginへpushしてください。')
    version = read_version(git('show', f'HEAD:{TARGET}').decode('utf-8'))
    print('GITHACK_URL=' + githack_url(match[1], match[2], branch))
    print('GITHACK_VERSION=v' + str(version))


# Each task takes (base_commit, fix). Raise on failure; return only after verification.
# Add new mandatory tasks here. No new configuration file is necessary.
TASKS = [('display-version', version_task), ('gas-sharing', gas_share_task), ('githack-preview', githack_task)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='作業開始前のコミットSHA。再試行でも同じ値を使う。')
    parser.add_argument('--fix', action='store_true', help='修正可能な必須作業を実行してから検査する')
    args = parser.parse_args()
    try:
        if not re.fullmatch(r'[0-9a-fA-F]{40}', args.base):
            raise ValueError('--base は作業開始前の完全なコミットSHAで指定してください。')
        root = git('rev-parse', '--show-toplevel').decode().strip()
        import os
        os.chdir(root)
        git('cat-file', '-e', f'{args.base}^{{commit}}')
    except (ValueError, subprocess.CalledProcessError) as error:
        print(f'ERROR [base]: {error}', file=sys.stderr)
        return 1
    failures = []
    if not TASKS or len({name for name, _ in TASKS}) != len(TASKS):
        print('ERROR: 必須作業一覧が空、またはIDが重複しています。', file=sys.stderr)
        return 1
    for name, task in TASKS:
        try:
            task(args.base, args.fix)
            print(f'PASS [{name}]')
        except Exception as error:
            failures.append(name)
            print(f'ERROR [{name}]: {error}', file=sys.stderr)
    if failures:
        print('未完了です。原因を修正し、同じ --base で再実行してください。検査を削除・緩和して合格させないでください。', file=sys.stderr)
        return 1
    print('必須検査は全項目合格。依頼内容の動作確認と、必要な公開先の反映確認を行ってください。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
