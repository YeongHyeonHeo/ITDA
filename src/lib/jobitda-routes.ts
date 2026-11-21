/** 개발환경에서는 인증 프록시와 분리한, 가상 데이터 전용 화면으로 연결합니다. */
const prefix = process.env.NODE_ENV === "development" ? "/preview" : "";
export const routes = {
  home: "/",
  signup: "/signup",
  login: "/login",
  youth: `${prefix}/youth`,
  company: `${prefix}/company`,
  mypage: `${prefix}/youth/mypage`,
  job: (id:string) => `${prefix}/youth/jobs/${encodeURIComponent(id)}`,
};
