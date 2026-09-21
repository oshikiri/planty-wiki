# Local-first principles

Planty-wiki が Local-first softwareの原則を満たしているかチェックする。
原則の出典は [Local-first software: You own your data, in spite of the cloud](https://www.inkandswitch.com/essay/local-first/) である。

ここでの状態は実装状況ではなく、製品としての対応方針を示す。
PoCでは、各原則の実装状況を「未検証」「達成」「部分達成」「対象外」のいずれかで確認する。
要求上「満たす」とした原則でも、PoCで未検証の項目は達成済みとは扱わない。

## 1. No spinners: your work at your fingertips -> 満たす

ネットワークやクラウド同期を待たず、ローカル保存を主として編集結果を反映する。

## 2. Your work is not trapped on one device -> 満たす

クラウド同期によって、同じSiteのアクセスを許可された利用者が複数端末で共有ノートを同期する。

## 3. The network is optional -> 満たす

初回起動にはネットワーク接続を必要とする。
初回起動完了後は、未ログインやオフラインの状態でもローカルのノートを閲覧、編集、保存できるようにする。

## 4. Seamless collaboration with your colleagues -> 部分的に満たす

Siteのアクセスを許可された利用者は同じノートを編集できる。ただし、リアルタイム共同編集は対象外とする。

## 5. The Long Now -> 部分的に満たす

Markdownのインポートとエクスポートによって、サービスに依存しないデータの移行と保存を可能にする。

## 6. Security and privacy by default -> 将来検討

ローカルデータとクラウド上のデータの保護方式、暗号化方式、削除方針は別途定める。

## 7. You retain ultimate ownership and control -> 満たす

Markdownのエクスポート、インポート、削除を提供し、ユーザーがデータをバックアップ、移行、取り出しできるようにする。
