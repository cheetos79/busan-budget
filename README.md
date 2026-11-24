# 부산대성 예산실적 관리 (GitHub Pages 배포판)

부산대성기숙학원의 월 예산 입력, 더존 실적 연계, 실적표, 월/분기/연간 분석, 인포그래픽 대시보드, AI 분석을 한 화면에서 쓰는 웹 시스템임.

1 구성

가. 화면: 단일 페이지(index.html). 계산 규칙과 화면은 claude.ai 판과 같은 코드임
나. 공유 저장: Firebase Firestore. 등록된 구성원만 읽고 씀(firestore.rules)
다. 로그인: Firebase Authentication(Google 계정 또는 이메일/비밀번호, 이메일 인증 필수)
라. AI 분석: Claude API를 각 사용자 브라우저에서 직접 호출함. API 키는 그 브라우저에만 저장됨
마. 실제 시스템(index.html)에는 자료와 내부 기준정보(계정 매핑, 적요 규칙)를 넣지 않음. 기준정보는 관리자가 로그인 후 JSON 파일로 한 번 올림. 연습판(training 폴더)에만 연습용으로 기준정보가 들어 있음

2 Firebase 설정 (관리자, 처음 한 번)

가. Firebase 콘솔(https://console.firebase.google.com)에서 프로젝트를 만듦
나. Authentication > 로그인 방법에서 Google, 이메일/비밀번호를 사용 설정함
다. Authentication > 설정 > 승인된 도메인에 이 사이트 주소의 도메인(예: 계정명.github.io)을 추가함
라. Firestore Database를 만듦. 프로덕션 모드, 위치는 asia-northeast3(서울)을 권함
마. Firestore > 규칙에 이 저장소의 firestore.rules 내용을 붙여넣고 게시함
바. Firestore > 데이터에서 members 컬렉션을 만들고 첫 관리자 문서를 추가함
  1) 문서 ID: 관리자 로그인 이메일(소문자)
  2) 필드: role = admin, name = 이름
사. 프로젝트 설정 > 내 앱 > 웹 앱 추가 후 나오는 firebaseConfig 값을 firebase-config.js의 null 자리에 붙여넣고 커밋함

3 첫 사용

가. 관리자가 사이트에 로그인함(이메일 가입이면 인증 메일의 링크를 먼저 누름)
나. 기준정보 화면 아래 '8 기준정보 가져오기'에서 경영기획실이 보관한 기준정보_초기값.json을 올림
다. '7 구성원 관리'에서 실무자 이메일을 editor로, 보기만 할 사람을 viewer로 등록함
라. 실무자는 같은 이메일로 로그인해 예산 입력을 시작함

4 AI 분석

가. console.anthropic.com에서 발급한 Claude API 키를 기준정보 화면 '6 AI 설정'에 넣음
나. 키는 서버에 저장하지 않고 그 브라우저에만 보관함. 사용 요금은 키를 발급한 계정에 청구됨
다. 분석 결과를 '분석 저장(공유)'으로 저장하면 다른 구성원도 키 없이 결과를 볼 수 있음

5 참고

가. claude.ai 판과 저장소가 달라 두 판의 자료는 서로 이어지지 않음. 한쪽을 주 시스템으로 정해 씀
나. firebase-config.js 값은 웹 앱을 가리키는 공개 식별자라 저장소에 있어도 됨. 자료 접근은 규칙과 구성원 등록으로 막음
다. 저장소 파일: index.html(앱), pages-adapter.js(Firebase, Claude API 연결), firebase-config.js(설정값), firestore.rules(보안 규칙)

6 연습판

가. 주소: 사이트 주소 뒤에 training/ 을 붙임(예: https://계정명.github.io/busan-budget/training/)
나. 로그인 없이 열리고, 입력한 내용은 그 브라우저에만 남음. 실제 자료(Firebase)와 이어지지 않음
다. 예시 자료, 12단계 튜토리얼, 버튼별 사용 설명이 들어 있음. AI 분석은 연습판에서 실행되지 않음
라. 연습판에는 분류 연습을 위해 기준정보(계정 매핑, 적요 규칙)가 들어 있음
